-- Zombie Idle leaderboard, upgrade 3: each save file is its own commander, and erasing a save takes its row off the
-- board. Run once in Supabase → SQL Editor → New query. Only the row's owner can delete it (it needs the row's secret,
-- which only that save holds).
create or replace function public.delete_entry(p_id uuid, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.leaderboard where id = p_id and secret = p_secret;
end $$;
revoke all on function public.delete_entry from public;
grant execute on function public.delete_entry to anon, authenticated;
