# YOU.

One page for all seven apps: BODY, MONEY, GYM, MEAL, WRITE, READ and SLEEP. Each tile shows one live number from that app and opens it. A coach at the bottom reads the last few weeks from every app at once and points out the connections the single-app coaches cannot see: the bad journal days that line up with skipped workouts, the spending that spikes on low days, the weight that moves when food logging thins out, the short nights before low days.

Nothing is written from here. YOU only reads the tables the other apps write, on the same login.

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
- `you.js` — sign-in, one read per app, the seven numbers, and the cross-app coach summary
- `api/week.mjs` — the Vercel function behind **Write my weekly review**
- `coach.js` and `api/coach.mjs` — the coach card and the Vercel function behind it
- `api/config.js` — hands the public Supabase settings and the seven app addresses to the page
- `quote-of-day.js` — a quote that changes at local midnight

**SLEEP** logs itself: the YOU watch app reads last night from Apple Health and uploads it, so its tile shows hours asleep, bed and wake times and your week's average against your goal, and its streak counts the nights recorded.

## Your week

Below the tiles, **Your week** shows last week (or this week, on a Sunday) across all seven apps, each against the week before: weight change, money spent against your weekly budget and debt left, workouts and cardio minutes, average calories and days within your goal, your average day rating with the best and lowest day, pages read, and your average night's sleep with how many nights reached your goal. A grid of dots shows which days you logged each app.

Press **Write my weekly review** and Claude reads the whole week, day by day, and writes what went well, what to watch, one connection between the apps (for example low-rated days that follow skipped workouts), and one focus for next week. Nothing is sent until you press it; each week's review is kept on this device. It uses the same `ANTHROPIC_API_KEY` as the coach and costs a few cents.

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**. This is the one to put on your first screen; the other seven are a tap away from it.
