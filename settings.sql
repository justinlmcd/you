-- YOU settings, kept with your account so they follow you to other devices (and, later, the other apps).
-- Run once in Supabase → SQL Editor. Safe to run again.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists us_read on public.user_settings;
drop policy if exists us_write on public.user_settings;
drop policy if exists us_edit on public.user_settings;
create policy us_read on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy us_write on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy us_edit on public.user_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
