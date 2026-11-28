-- Zombie Idle problem reports (Settings → Help → Report a problem).
-- Run once in Supabase → SQL Editor → New query. Players can only ADD reports; nobody can read them through the game's
-- public key. You read them in Supabase → Table Editor → reports (newest first).
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  player text check (player is null or char_length(player) <= 32),
  report text not null check (char_length(report) between 1 and 60000)
);
alter table public.reports enable row level security;
drop policy if exists "anyone can file a report" on public.reports;
create policy "anyone can file a report" on public.reports for insert to anon, authenticated with check (true);
revoke all on public.reports from anon, authenticated;
grant insert (player, report) on public.reports to anon, authenticated;
