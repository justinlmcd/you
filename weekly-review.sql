-- Weekly review on its own. Run once in Supabase → SQL Editor (safe to run again), after deploying the
-- weekly-review Edge Function (supabase/functions/weekly-review) and adding its ANTHROPIC_API_KEY secret.

-- Your weekly reviews: the one written automatically on Sunday and any you write with the button.
create table if not exists public.weekly_reviews (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,                    -- the Monday the week starts
  review jsonb not null,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.weekly_reviews enable row level security;
drop policy if exists wr_read on public.weekly_reviews;
drop policy if exists wr_write on public.weekly_reviews;
drop policy if exists wr_edit on public.weekly_reviews;
create policy wr_read on public.weekly_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy wr_write on public.weekly_reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy wr_edit on public.weekly_reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The devices you turned notifications on for.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists ps_read on public.push_subscriptions;
drop policy if exists ps_write on public.push_subscriptions;
drop policy if exists ps_edit on public.push_subscriptions;
drop policy if exists ps_remove on public.push_subscriptions;
create policy ps_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy ps_write on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy ps_edit on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ps_remove on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- The keys notifications are signed with. Made by the function on first use; row security with no policies
-- means only the function (with the service key) can read them.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- Every hour at :05, with the project's public anon key (the same one any page could use), ask the function whether anyone's Sunday review is due. It does nothing the rest of the week.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'weekly-review';
select cron.schedule('weekly-review', '5 * * * *', $job$
  select net.http_post(
    url := 'https://embpqpdpimreojqwvetj.supabase.co/functions/v1/weekly-review?action=run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtYnBxcGRwaW1yZW9qcXd2ZXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjA5OTQsImV4cCI6MjA5NTk5Njk5NH0.ahmUS2Bi9_8lDRkihwgXxkK1u73R5Q0szkiNsvSHSN0'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$job$);
