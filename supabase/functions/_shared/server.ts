import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const origins = [...(Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean), 'https://bao-tang-dem-len-den.mythic-shore-0253.chatgpt.site'];
export function serve(handler: (req: Request, db: any, user: any) => Promise<unknown>) {
  Deno.serve(async req => {
    const origin = req.headers.get('origin') || '';
    const headers: Record<string,string> = {'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
    if (origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers});
    if (origin && !origins.includes(origin)) return reply({error:'Nguồn yêu cầu không được phép.'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (req.method !== 'POST') return reply({error:'Chỉ chấp nhận POST.'},405);
    try {
      const url = Deno.env.get('SUPABASE_URL')!, secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return reply({error:'Bạn cần đăng nhập.'},401);
      const db = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error} = await db.auth.getUser(token);
      const user = data?.user;
      const google = user?.identities?.find((i:any) => i.provider === 'google' && i.identity_data?.email_verified === true);
      if (error || !user || !user.email_confirmed_at || !google || !user.email) return reply({error:'Cần tài khoản Google có email đã xác minh.'},401);
      const name = user.user_metadata?.full_name || user.user_metadata?.name || 'Người chơi';
      const parts = String(name).trim().split(/\s+/);
      const displayName = parts.length>1 ? parts.slice(0,-1).join(' ')+' '+parts.at(-1)![0]+'.' : parts[0];
      const {error:saveError} = await db.from('players').upsert({id:user.id,email:user.email,full_name:name,display_name:displayName},{onConflict:'id',ignoreDuplicates:true});
      if (saveError) throw new Error('Không ghi được hồ sơ người chơi.');
      return reply(await handler(req,db,user));
    } catch(e) { return reply({error:e instanceof Error ? e.message : 'Lỗi xử lý yêu cầu.'},400); }
  });
}
export async function rpc(db:any,name:string,args:Record<string,unknown>) { const {data,error} = await db.rpc(name,args); if (error) throw new Error(error.message); return data; }
