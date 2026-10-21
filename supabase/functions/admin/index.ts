import { serve,rpc } from '../_shared/server.ts';
const csvCell = (value:unknown) => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'"+text; return '"'+text.replaceAll('"','""')+'"'; };
serve(async (req,db,user) => {
  const {data:organizer,error:authError} = await db.from('organizers').select('id').eq('id',user.id).maybeSingle();
  if (authError || !organizer) throw new Error('Tài khoản không có quyền quản trị.');
  const body = await req.json();
  if (body.action === 'close') { await rpc(db,'game_close_campaign',{p_admin:user.id}); return {closed:true}; }
  if (body.action === 'review') { await rpc(db,'game_review_attempt',{p_admin:user.id,p_attempt:body.attemptId,p_decision:body.decision}); return {ok:true}; }
  if (body.action === 'export') {
    // Read the view and profiles separately; the view has no foreign-key metadata.
    const {data:leaders,error:leaderError} = await db.from('leaderboard').select('*').order('rank');
    if (leaderError) throw new Error(leaderError.message);
    const {data:players,error:playerError} = await db.from('players').select('id,email,full_name');
    if (playerError) throw new Error(playerError.message);
    const map = new Map(players.map((p:any) => [p.id,p]));
    const lines = [['Hạng','Họ tên','Email','Độ lệch (ms)','Điểm','Thời điểm đạt'].map(csvCell).join(',')];
    for (const r of leaders) { const p:any = map.get(r.player_id); lines.push([r.rank,p?.full_name,p?.email,r.deviation_ms,r.score,r.achieved_at].map(csvCell).join(',')); }
    return {csv:lines.join('\r\n')};
  }
  if (body.action !== 'list') throw new Error('Thao tác không hợp lệ.');
  let query = db.from('attempts').select('*,players!inner(email,full_name)').order('started_at',{ascending:false}).limit(500);
  if (body.filter === 'suspicious') query = query.eq('status','suspicious');
  const {data:rows,error} = await query;
  if (error) throw new Error(error.message);
  const {data:config,error:configError} = await db.from('campaign_config').select('closed').single();
  if (configError) throw new Error(configError.message);
  return {rows:rows.map((r:any) => ({...r,email:r.players.email,full_name:r.players.full_name,players:undefined})),closed:config.closed};
});
