-- YOU goals: targets that track themselves from what the apps log. Run once in Supabase → SQL Editor. Safe to run again.
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weight','debt','spend','workouts','sleep','book')),
  target numeric not null check (target >= 0),
  unit text,                                   -- weight goals: lbs or kg
  start_value numeric,                         -- weight and debt: where you were when you set it
  start_date date not null default current_date,
  due_date date,                               -- optional "by" date
  ref text,                                    -- book goals: the book's id
  done_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id, created_at);
alter table public.goals enable row level security;
drop policy if exists goals_read on public.goals;
drop policy if exists goals_write on public.goals;
drop policy if exists goals_edit on public.goals;
drop policy if exists goals_remove on public.goals;
create policy goals_read on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_write on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_edit on public.goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_remove on public.goals for delete to authenticated using (user_id = (select auth.uid()));
