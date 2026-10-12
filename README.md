# YOU.

One page for all six apps: BODY, MONEY, GYM, MEAL, WRITE and READ. Each tile shows one live number from that app and opens it. A coach at the bottom reads the last few weeks from every app at once and points out the connections the single-app coaches cannot see: the bad journal days that line up with skipped workouts, the spending that spikes on low days, the weight that moves when food logging thins out.

Nothing is written from here. YOU only reads the tables the other apps write, on the same login.

## Set up (about 10 minutes)

1. **Supabase.** Nothing to run. YOU reads the tables the other apps created. An app you have not set up yet shows as "not set up" on its tile and the rest keep working.
2. **Vercel.** Import this repository at vercel.com → Add New → Project. Framework preset **Other**, no build command, root directory blank.
3. **Environment variables** on that Vercel screen:
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` → same as every other app
   - `ANTHROPIC_API_KEY` → for the coach (and `ANTHROPIC_WORKSPACE_ID` if your key is organization-level)
   - `URL_BODY`, `URL_MONEY`, `URL_GYM`, `URL_MEAL`, `URL_WRITE`, `URL_READ` → each app's address, like `https://money-mauve-five.vercel.app`, so the tiles open them. Until these are set the tiles show numbers but do not link, and the page tells you which are missing.
4. **Deploy.** Open the URL, sign in, and press **Ask the coach**.

Vercel redeploys on every push to `main`.

## What's in it

- `index.html` — the page and its styles
- `you.js` — sign-in, one read per app, the six numbers, and the cross-app coach summary
- `coach.js` and `api/coach.mjs` — the coach card and the Vercel function behind it
- `api/config.js` — hands the public Supabase settings and the six app addresses to the page
- `quote-of-day.js` — a quote that changes at local midnight

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**. This is the one to put on your first screen; the other six are a tap away from it.
