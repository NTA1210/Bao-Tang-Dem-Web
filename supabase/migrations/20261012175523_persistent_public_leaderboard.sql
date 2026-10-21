-- One verified Google email maps to one player. Names may repeat.
create unique index if not exists players_email_unique on public.players(lower(btrim(email)));

-- Only this safe projection is readable by visitors. Private tables remain private.
create table public.leaderboard_players (
  player_id uuid primary key references public.players(id) on delete cascade,
  display_name text not null,
  deviation_ms integer,
  score integer,
  achieved_at timestamptz,
  status text not null check (status in ('ranked','pending','no_valid','unplayed')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.leaderboard_players enable row level security;
revoke all on public.leaderboard_players from public,anon,authenticated;
grant select on public.leaderboard_players to anon,authenticated;
grant all on public.leaderboard_players to service_role;
create policy leaderboard_read_all on public.leaderboard_players for select to anon,authenticated using (true);
create index leaderboard_players_best on public.leaderboard_players(deviation_ms,achieved_at,player_id) where status='ranked';

create schema if not exists game_private;
revoke all on schema game_private from public,anon,authenticated;
create function game_private.refresh_leaderboard(p_player uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.players; a public.attempts; state_value text;
begin
 select * into p from public.players where id=p_player and profile_done;
 if not found then delete from public.leaderboard_players where player_id=p_player; return; end if;
 select * into a from public.attempts where player_id=p_player and status='valid'
 order by deviation_ms,stopped_at,id limit 1;
 if found then state_value:='ranked';
 elsif exists(select 1 from public.attempts where player_id=p_player and status='suspicious') then state_value:='pending';
 elsif exists(select 1 from public.attempts where player_id=p_player) then state_value:='no_valid';
 else state_value:='unplayed'; end if;
 insert into public.leaderboard_players(player_id,display_name,deviation_ms,score,achieved_at,status,updated_at)
 values(p.id,p.full_name,a.deviation_ms,a.score,a.stopped_at,state_value,clock_timestamp())
 on conflict(player_id) do update set display_name=excluded.display_name,deviation_ms=excluded.deviation_ms,
 score=excluded.score,achieved_at=excluded.achieved_at,status=excluded.status,updated_at=excluded.updated_at;
end $$;
revoke all on function game_private.refresh_leaderboard(uuid) from public,anon,authenticated;

create function game_private.sync_leaderboard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='players' then
   if TG_OP='DELETE' then perform game_private.refresh_leaderboard(OLD.id);
   else perform game_private.refresh_leaderboard(NEW.id); end if;
 else
   if TG_OP='DELETE' then perform game_private.refresh_leaderboard(OLD.player_id);
   else perform game_private.refresh_leaderboard(NEW.player_id);
     if TG_OP='UPDATE' and OLD.player_id is distinct from NEW.player_id then perform game_private.refresh_leaderboard(OLD.player_id); end if;
   end if;
 end if;
 return null;
end $$;
revoke all on function game_private.sync_leaderboard() from public,anon,authenticated;
create trigger sync_player_public_ranking after insert or update or delete on public.players for each row execute function game_private.sync_leaderboard();
create trigger sync_attempt_public_ranking after insert or update or delete on public.attempts for each row execute function game_private.sync_leaderboard();

select game_private.refresh_leaderboard(id) from public.players where profile_done;

create or replace view public.leaderboard with (security_invoker=true) as
select player_id,display_name,deviation_ms,score,achieved_at,
 row_number() over(order by deviation_ms,achieved_at,player_id) as rank
from public.leaderboard_players where status='ranked';
create view public.leaderboard_directory with (security_invoker=true) as
select player_id,display_name,deviation_ms,score,achieved_at,
 case when status='ranked' then row_number() over(partition by status order by deviation_ms,achieved_at,player_id) end as rank,
 status,updated_at from public.leaderboard_players;
revoke all on public.leaderboard,public.leaderboard_directory from public,anon,authenticated;
grant select on public.leaderboard,public.leaderboard_directory to anon,authenticated,service_role;
