import { serve } from '../_shared/server.ts';
serve(async (req,db,user) => {
  const body = await req.json();
  const name = String(body?.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim();
  if (name.length < 2 || name.length > 60) throw new Error('Tên cần từ 2 đến 60 ký tự.');
  const parts = name.split(' ');
  const displayName = parts.length>1 ? parts.slice(0,-1).join(' ')+' '+Array.from(parts.at(-1)!)[0]+'.' : parts[0];
  const {error} = await db.from('players').update({full_name:name,display_name:displayName,profile_done:true}).eq('id',user.id);
  if (error) throw new Error('Không lưu được hồ sơ người chơi.');
  return {full_name:name,profile_done:true};
});
