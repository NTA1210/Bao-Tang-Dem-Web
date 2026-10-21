import { serve,rpc } from '../_shared/server.ts';
serve(async (_req,db,user) => await rpc(db,'game_start_attempt',{p_player:user.id}));
