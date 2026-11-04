# YOU.

One page for all seven apps: BODY, MONEY, GYM, MEAL, WRITE, READ and SLEEP. Each tile shows one live number from that app and opens it. A coach at the bottom reads the last few weeks from every app at once and points out the connections the single-app coaches cannot see: the bad journal days that line up with skipped workouts, the spending that spikes on low days, the weight that moves when food logging thins out, the short nights before low days.

YOU reads the tables the other apps write, on the same login. The only things it writes are your goals and your settings.

## Set up (about 10 minutes)

1. **Supabase.** Nothing to run. YOU reads the tables the other apps created. An app you have not set up yet shows as "not set up" on its tile and the rest keep working.
2. **Vercel.** Import this repository at vercel.com → Add New → Project. Framework preset **Other**, no build command, root directory blank.
3. **Environment variables** on that Vercel screen:
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` → same as every other app
   - `ANTHROPIC_API_KEY` → for the coach (and `ANTHROPIC_WORKSPACE_ID` if your key is organization-level)
   - `URL_BODY`, `URL_MONEY`, `URL_GYM`, `URL_MEAL`, `URL_WRITE`, `URL_READ`, `URL_SLEEP` → each app's address, like `https://money-mauve-five.vercel.app`, so the tiles open them. Until these are set the tiles show numbers but do not link, and the page tells you which are missing.
4. **Deploy.** Open the URL, sign in, and press **Ask the coach**.

Vercel redeploys on every push to `main`.

## What's in it

- `index.html` — the page and its styles
- `settings.js` — theme, accent, font, time zone, day end and units, applied before the page paints
- `settings.sql` — the `user_settings` table that keeps your settings with your account
- `you.js` — sign-in, one read per app, the seven numbers, and the cross-app coach summary
- `api/week.mjs` — the Vercel function behind **Write my weekly review**
- `coach.js` and `api/coach.mjs` — the coach card and the Vercel function behind it
- `api/config.js` — hands the public Supabase settings and the seven app addresses to the page
- `quote-of-day.js` — a quote that changes at local midnight

**SLEEP** logs itself: the YOU watch app reads last night from Apple Health and uploads it, so its tile shows hours asleep, bed and wake times and your week's average against your goal, and its streak counts the nights recorded.

## Weekly review on its own

Every Sunday at 6 PM (or the hour you pick in **Settings → Weekly review**), YOU writes your weekly review by itself, so it's waiting under **Your week** when you open the app, and your phone gets **Your weekly review is ready**. It runs in Supabase, so it works with every app closed:

- `supabase/functions/weekly-review`: an Edge Function that Supabase's scheduler calls every hour. On Sunday evening it reads your week from the apps' tables, has Claude write the review (same coach and wording as the button), saves it to `weekly_reviews`, and sends the notification. `review-core.js` is the week and its summary.
- `weekly-review.sql`: the `weekly_reviews`, `you_push_devices` and `push_keys` tables, and the hourly schedule (pg_cron).
- `sw.js`: shows the notification and opens your week when you tap it.

Set up once: deploy the function, add an **ANTHROPIC_API_KEY** secret in Supabase (**Edge Functions → Secrets**), run `weekly-review.sql`. Then, on your iPhone, open YOU from its Home Screen icon (Share → **Add to Home Screen** if it isn't there; iOS 16.4 or later), go to **Settings → Weekly review → Notifications → Turn on**, allow notifications, and **Send a test**. Reviews you write with the button are saved to your account too, so every device shows them.

## Goals

**Your goals** (below the tiles, and in the sidebar) are targets that track themselves from what you already log:

- **Reach a weight** (BODY): progress from where you started, your trend over the last four weeks, and the date you'll get there at that pace.
- **Pay off debt** (MONEY): your debts' total balance against where it was when you set the goal, and when you'll be clear at the rate you're paying.
- **Spend under a monthly limit** (MONEY): this month so far and where you're on pace to finish.
- **Work out each week** (GYM): days with sets or cardio this week, and how many of the last four weeks you hit it.
- **Sleep more** (SLEEP): your 7-night average against your target.
- **Finish a book** (READ): pages logged against the book's length, and your finish date at your recent pace.

Give weight, debt and book goals an optional date and YOU says whether you're on pace, how early or late, and what it takes to make it. Goals are marked done when you reach them. The coach and the weekly review read them too. Run [goals.sql](goals.sql) once in Supabase.

## Settings

**Settings** (top right, or in the sidebar) changes:

- **Theme**: System (follows your phone or computer), Dark or Light.
- **Accent**: Stone, Mint, Sky, Lilac, Peach, Rose or Gold, for buttons, links and highlights. Each app's tile keeps its own colour.
- **Font**: Default, System, Rounded, Serif or Mono, all fonts already on your device.
- **Time zone**: automatic, or any time zone, for which day it is and the times shown.
- **Day ends at**: midnight to 6 AM. If you're up past midnight, logs before this time count toward the day before, so today's count and your streaks don't roll over until you've gone to bed. Logs the other apps dated after midnight are counted toward your day too.
- **Units**: weight in lbs or kg (BODY weigh-ins are converted), and height and distance in ft and mi or m and km.

Changes apply straight away and are saved on the device. Run [settings.sql](settings.sql) once in Supabase and they're also saved to your account, so they follow you to your other devices.

## Your week

Below the tiles, **Your week** shows last week (or this week, on a Sunday) across all seven apps, each against the week before: weight change, money spent against your weekly budget and debt left, workouts and cardio minutes, average calories and days within your goal, your average day rating with the best and lowest day, pages read, and your average night's sleep with how many nights reached your goal. A grid of dots shows which days you logged each app.

Press **Write my weekly review** and Claude reads the whole week, day by day, and writes what went well, what to watch, one connection between the apps (for example low-rated days that follow skipped workouts), and one focus for next week. Nothing is sent until you press it; each week's review is kept on this device. It uses the same `ANTHROPIC_API_KEY` as the coach and costs a few cents.

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**. This is the one to put on your first screen; the other seven are a tap away from it.
