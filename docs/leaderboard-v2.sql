-- Zombie Idle leaderboard, upgrade 2: a flexible "stats" field so the Leaderboard tab can rank by many stats
-- (kills, play time, DNA earned per colour, troop level, best combo, ...). Run once in Supabase → SQL Editor → New query.
-- Safe to run again. The original submit_score keeps working for older versions of the game.

alter table public.leaderboard add column if not exists stats jsonb not null default '{}'::jsonb;

create or replace view public.leaderboard_public as
  select id, name, hordes, tier, kills, bosses, runs, updated_at, stats from public.leaderboard;
grant select on public.leaderboard_public to anon, authenticated;

create or replace function public.submit_stats(p_id uuid, p_secret text, p_name text, p_stats jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare row public.leaderboard; k text; v jsonb; clean jsonb := '{}'::jsonb;
begin
  if char_length(coalesce(p_secret, '')) < 16 then raise exception 'bad secret'; end if;
  p_name := left(regexp_replace(coalesce(p_name, ''), '[^[:alnum:] _-]', '', 'g'), 16);
  if char_length(p_name) < 2 then raise exception 'bad name'; end if;
  if jsonb_typeof(p_stats) <> 'object' then raise exception 'bad stats'; end if;
  -- keep only short keys with sane, non-negative numbers (DNA totals are sent as natural logs, so they stay small)
  for k, v in select * from jsonb_each(p_stats) loop
    if char_length(k) <= 24 and k ~ '^[a-z0-9_]+$' and jsonb_typeof(v) = 'number' and (v::text)::numeric >= 0 and (v::text)::numeric < 1e15 then
      clean := clean || jsonb_build_object(k, v);
    end if;
  end loop;
  if coalesce((clean->>'hordes')::numeric, 0) > 100000 or coalesce((clean->>'bosses')::numeric, 0) > 1000000 then raise exception 'bad numbers'; end if;
  select * into row from public.leaderboard where id = p_id;
  if not found then
    insert into public.leaderboard (id, secret, name, hordes, tier, kills, bosses, runs, stats)
    values (p_id, p_secret, p_name, coalesce((clean->>'hordes')::int, 0), coalesce((clean->>'tier')::int, 0), coalesce((clean->>'kills')::bigint, 0),
            coalesce((clean->>'bosses')::int, 0), coalesce((clean->>'runs')::int, 0), clean);
  elsif row.secret <> p_secret then
    raise exception 'not your row';
  elsif row.updated_at > now() - interval '20 seconds' then
    return;   -- rate limit
  else
    update public.leaderboard set name = p_name, hordes = coalesce((clean->>'hordes')::int, 0), tier = coalesce((clean->>'tier')::int, 0),
      kills = coalesce((clean->>'kills')::bigint, 0), bosses = coalesce((clean->>'bosses')::int, 0), runs = coalesce((clean->>'runs')::int, 0),
      stats = clean, updated_at = now() where id = p_id;
  end if;
end $$;
revoke all on function public.submit_stats from public;
grant execute on function public.submit_stats to anon, authenticated;

-- Remove the test rows left by setup (safe to run any time)
delete from public.leaderboard where name in ('HQTest', 'HQTest2');
