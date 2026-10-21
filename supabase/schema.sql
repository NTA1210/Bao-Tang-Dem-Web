-- Run once in the Supabase SQL Editor. These tables are NOT writable by browsers.
create table public.campaign_config (
  id boolean primary key default true check (id),
  attempts_per_user integer not null default 3 check (attempts_per_user = 3),
  attempt_scope text not null default 'total' check (attempt_scope in ('total','per_day')),
  score_decay_ms integer not null default 250 check (score_decay_ms > 0),
  overshoot_ms integer not null default 3000 check (overshoot_ms > 0),
  latency_tolerance_ms integer not null default 1000 check (latency_tolerance_ms > 0),
  game_start timestamptz, game_end timestamptz, closed boolean not null default false
);
insert into public.campaign_config(id) values(true);
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, full_name text not null, display_name text not null,
  profile_done boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.organizers (id uuid primary key references auth.users(id) on delete cascade);
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  scope_key text not null, attempt_number integer not null check(attempt_number between 1 and 3),
  started_at timestamptz not null default clock_timestamp(), stopped_at timestamptz,
  client_elapsed_ms double precision, elapsed_ms integer, deviation_ms integer,
  score integer not null default 0 check(score between 0 and 1000),
  status text not null default 'running' check(status in ('running','valid','expired','suspicious','rejected')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  unique(player_id,scope_key,attempt_number)
);
create index attempts_player on public.attempts(player_id,started_at);
create index attempts_ranking on public.attempts(status,deviation_ms,stopped_at);
alter table public.campaign_config enable row level security;
alter table public.players enable row level security;
alter table public.organizers enable row level security;
alter table public.attempts enable row level security;
revoke all on public.players, public.attempts, public.organizers, public.campaign_config from anon,authenticated;
grant all on public.players, public.attempts, public.organizers, public.campaign_config to service_role;

-- The owner executes this view, but it exposes ONLY these public fields.
-- There are deliberately no browser policies on the underlying tables.
create view public.leaderboard as
with best as (
  select distinct on (a.player_id) a.player_id,p.display_name,a.deviation_ms,a.score,a.stopped_at as achieved_at,a.id
  from public.attempts a join public.players p on p.id=a.player_id
  where a.status='valid'
  order by a.player_id,a.deviation_ms,a.stopped_at,a.id
)
select player_id,display_name,deviation_ms,score,achieved_at,
  row_number() over(order by deviation_ms,achieved_at,id) as rank
from best;
revoke all on public.leaderboard from public,anon,authenticated;
grant select on public.leaderboard to anon,authenticated,service_role;

create function public.game_start_attempt(p_player uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c campaign_config; a attempts; used integer; scope text; current_time_value timestamptz;
begin
  select * into c from campaign_config where id=true for update;
  current_time_value := clock_timestamp();
  if c.closed or (c.game_start is not null and current_time_value<c.game_start) or (c.game_end is not null and current_time_value>c.game_end) then
    raise exception 'Chiến dịch chưa mở hoặc đã kết thúc.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player::text,0));
  update attempts set status='expired',score=0,elapsed_ms=10000+c.overshoot_ms,
    deviation_ms=c.overshoot_ms,stopped_at=started_at+((10000+c.overshoot_ms)::text||' milliseconds')::interval
  where player_id=p_player and status='running' and started_at<=current_time_value-((10000+c.overshoot_ms)::text||' milliseconds')::interval;
  if exists(select 1 from attempts where player_id=p_player and status='running') then raise exception 'Bạn còn một lượt đang chơi.'; end if;
  scope := case when c.attempt_scope='per_day' then to_char(current_time_value at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD') else 'total' end;
  select count(*) into used from attempts where player_id=p_player and scope_key=scope;
  if used>=c.attempts_per_user then raise exception 'Bạn đã dùng đủ 3 lượt.'; end if;
  insert into attempts(player_id,scope_key,attempt_number,started_at) values(p_player,scope,used+1,current_time_value) returning * into a;
  return jsonb_build_object('id',a.id,'started_at',a.started_at,'attempt_number',a.attempt_number);
end $$;

create function public.game_stop_attempt(p_player uuid,p_attempt uuid,p_client_elapsed double precision) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c campaign_config; a attempts; server_elapsed integer; final_status text; deviation integer; points integer;
begin
  select * into c from campaign_config where id=true for update;
  select * into a from attempts where id=p_attempt and player_id=p_player for update;
  if not found then raise exception 'Không tìm thấy lượt chơi của bạn.'; end if;
  -- Retry is idempotent: stopping twice cannot replace a result.
  if a.status<>'running' then return to_jsonb(a)-'player_id'-'reviewed_by'; end if;
  server_elapsed:=greatest(0,round(extract(epoch from (clock_timestamp()-a.started_at))*1000)::integer);
  deviation:=abs(server_elapsed-10000);
  final_status:=case when c.closed or server_elapsed>=10000+c.overshoot_ms then 'expired'
    when p_client_elapsed is null or p_client_elapsed<0 or p_client_elapsed>10000+c.overshoot_ms
      or abs(server_elapsed-p_client_elapsed)>c.latency_tolerance_ms then 'suspicious' else 'valid' end;
  points:=case when final_status='expired' then 0 else round(1000*exp(-deviation::numeric/c.score_decay_ms))::integer end;
  update attempts set stopped_at=clock_timestamp(),client_elapsed_ms=p_client_elapsed,
    elapsed_ms=server_elapsed,deviation_ms=deviation,score=points,status=final_status where id=a.id returning * into a;
  return to_jsonb(a)-'player_id'-'reviewed_by';
end $$;

create function public.game_player_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c campaign_config; scope text; result jsonb; prof jsonb;
begin
  select * into c from campaign_config where id=true;
  scope:=case when c.attempt_scope='per_day' then to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD') else 'total' end;
  update attempts set status='expired',score=0,elapsed_ms=10000+c.overshoot_ms,deviation_ms=c.overshoot_ms,
    stopped_at=started_at+((10000+c.overshoot_ms)::text||' milliseconds')::interval
  where player_id=p_player and status='running' and started_at<=clock_timestamp()-((10000+c.overshoot_ms)::text||' milliseconds')::interval;
  select coalesce(jsonb_agg(to_jsonb(a)-'player_id'-'reviewed_by' order by a.attempt_number),'[]'::jsonb) into result
    from attempts a where player_id=p_player and scope_key=scope;
  select jsonb_build_object('full_name',full_name,'profile_done',profile_done) into prof from players where id=p_player;
  return jsonb_build_object('attempts',result,'closed',c.closed,'profile',prof);
end $$;

create function public.game_review_attempt(p_admin uuid,p_attempt uuid,p_decision text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare is_closed boolean;
begin
  if not exists(select 1 from organizers where id=p_admin) then raise exception 'Không có quyền quản trị.'; end if;
  select closed into is_closed from campaign_config where id=true for update;
  if is_closed then raise exception 'Bảng đã chốt, không thể thay đổi.'; end if;
  if p_decision not in ('valid','rejected') then raise exception 'Quyết định không hợp lệ.'; end if;
  update attempts set status=p_decision,reviewed_by=p_admin,reviewed_at=clock_timestamp() where id=p_attempt and status='suspicious';
  if not found then raise exception 'Lượt này không ở trạng thái cần duyệt.'; end if;
end $$;
create function public.game_close_campaign(p_admin uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from organizers where id=p_admin) then raise exception 'Không có quyền quản trị.'; end if;
  update campaign_config set closed=true where id=true;
  update attempts set status='expired',score=0,stopped_at=clock_timestamp(),elapsed_ms=13000,deviation_ms=3000 where status='running';
end $$;
revoke all on function public.game_start_attempt(uuid),public.game_stop_attempt(uuid,uuid,double precision),public.game_player_state(uuid),public.game_review_attempt(uuid,uuid,text),public.game_close_campaign(uuid) from public,anon,authenticated;
grant execute on function public.game_start_attempt(uuid),public.game_stop_attempt(uuid,uuid,double precision),public.game_player_state(uuid),public.game_review_attempt(uuid,uuid,text),public.game_close_campaign(uuid) to service_role;
