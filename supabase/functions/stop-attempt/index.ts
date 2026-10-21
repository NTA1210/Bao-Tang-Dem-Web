import { serve,rpc } from '../_shared/server.ts';
serve(async (req,db,user) => {
  const body = await req.json();
  if (typeof body.attemptId !== 'string' || !Number.isFinite(body.clientElapsed) || body.clientElapsed < 0 || body.clientElapsed > 13000) throw new Error('Dữ liệu lượt chơi không hợp lệ.');
  return await rpc(db,'game_stop_attempt',{p_player:user.id,p_attempt:body.attemptId,p_client_elapsed:body.clientElapsed});
});
