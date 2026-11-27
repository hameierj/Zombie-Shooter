-- Zombie Idle global leaderboard (Supabase). Paste all of this into Supabase → SQL Editor → New query → Run.
-- Players can't write the table directly: they go through submit_score(), which only lets the device that created a row
-- (the one holding its secret) update it, and sanity-checks the numbers. Everyone can read the public view.

create table if not exists public.leaderboard (
  id uuid primary key,
  secret text not null,
  name text not null check (char_length(name) between 2 and 16),
  hordes int not null default 0 check (hordes >= 0),
  tier int not null default 0 check (tier >= 0),
  kills bigint not null default 0 check (kills >= 0),
  bosses int not null default 0 check (bosses >= 0),
  runs int not null default 0 check (runs >= 0),
  updated_at timestamptz not null default now()
);
alter table public.leaderboard enable row level security;
-- no policies on the table itself: nobody can read secrets or write rows directly

create or replace view public.leaderboard_public as
  select id, name, hordes, tier, kills, bosses, runs, updated_at from public.leaderboard;
grant select on public.leaderboard_public to anon, authenticated;

create or replace function public.submit_score(p_id uuid, p_secret text, p_name text, p_hordes int, p_tier int, p_kills bigint, p_bosses int, p_runs int)
returns void language plpgsql security definer set search_path = public as $$
declare row public.leaderboard;
begin
  if char_length(coalesce(p_secret, '')) < 16 then raise exception 'bad secret'; end if;
  p_name := left(regexp_replace(coalesce(p_name, ''), '[^[:alnum:] _-]', '', 'g'), 16);
  if char_length(p_name) < 2 then raise exception 'bad name'; end if;
  if p_hordes < 0 or p_tier < 0 or p_kills < 0 or p_bosses < 0 or p_runs < 0
     or p_hordes > 100000 or p_tier > 1000000 or p_bosses > 1000000 or p_runs > 10000 then raise exception 'bad numbers'; end if;
  select * into row from public.leaderboard where id = p_id;
  if not found then
    insert into public.leaderboard (id, secret, name, hordes, tier, kills, bosses, runs) values (p_id, p_secret, p_name, p_hordes, p_tier, p_kills, p_bosses, p_runs);
  elsif row.secret <> p_secret then
    raise exception 'not your row';
  elsif row.updated_at > now() - interval '20 seconds' then
    return;   -- rate limit
  else
    update public.leaderboard set name = p_name, hordes = p_hordes, tier = p_tier, kills = p_kills, bosses = p_bosses, runs = p_runs, updated_at = now() where id = p_id;
  end if;
end $$;
revoke all on function public.submit_score from public;
grant execute on function public.submit_score to anon, authenticated;
