// Weekly review on its own. Every hour, Supabase's scheduler (pg_cron) calls this with ?action=run. On Sunday,
// at or after the hour you chose in YOU's settings (6 PM unless you change it), it reads your week from the apps'
// tables, has Claude write the review, saves it to weekly_reviews for YOU to show, and sends
// "Your weekly review is ready" to every device you turned notifications on for. Once a week, so extra calls are harmless.
// ?action=key gives the browser the public key it subscribes with; ?action=test (signed in) sends a test notification.
// Needs the ANTHROPIC_API_KEY secret (Supabase → Edge Functions → Secrets). SUPABASE_URL and the service key are built in.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";
import { addDays, due, summary } from "./review-core.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Same coach and shape as YOU's "Write my weekly review" (api/week.mjs).
const ROLE = `You are a calm, honest coach writing one person's weekly review across seven logs: body weight, spending, training, food, a daily journal rating with notes, reading, and sleep from Apple Health (each night is listed on the morning they woke). Compare the week with the one before where the data allows. Your most useful job is the connection the single-app coaches cannot see: a low-rated day that follows a skipped workout or a poor night of eating, spending that spikes on bad days, weight moving while food logging thins out, reading that stops when training stops, a short night before a low-rated day, a skipped workout, or a heavy-eating day. Only state a connection the days actually show; if none is clear, leave it empty rather than stretch. Name the apps and the days. Be warm and plain, never preachy. Do not give medical or financial advice. If the journal suggests crisis or self-harm, say gently that this is beyond what a weekly review can help with.`;
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["headline", "wins", "watch", "connection", "next_week"],
  properties: {
    headline: { type: "string", description: "One or two plain sentences: how the week went overall, with the key numbers." },
    wins: { type: "array", items: { type: "string" }, description: "One to three specific things that went well, each one short sentence citing the data." },
    watch: { type: "array", description: "One to three things to watch or change.", items: { type: "object", additionalProperties: false, required: ["what", "why"], properties: { what: { type: "string", description: "The thing, as a short instruction." }, why: { type: "string", description: "The evidence in the week, one short sentence." } } } },
    connection: { type: "string", description: "One pattern linking two or more apps, naming the days. Empty string if the week shows none." },
    next_week: { type: "string", description: "The single focus for next week, concrete enough to act on." },
  },
};

// The push keys are made once and kept in push_keys, which only this function can read.
async function vapid(): Promise<{ public_key: string; private_key: string }> {
  const { data } = await admin.from("push_keys").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  await admin.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: saved, error } = await admin.from("push_keys").select("public_key,private_key").eq("id", 1).single();
  if (error) throw error;
  return saved;
}

// Sends one notification to each of a person's devices; forgets devices that have unsubscribed.
async function notify(userId: string, payload: { title: string; body: string; url: string }) {
  const keys = await vapid();
  webpush.setVapidDetails(SUPABASE_URL, keys.public_key, keys.private_key);
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (e as { body?: string }).body ?? String(e));
    }
  }
  return sent;
}

// One person's last two weeks from each app. The service key skips row security, so every read names the person.
async function weekData(uid: string, start: string) {
  const from = addDays(start, -7);
  const rows = async (table: string, cols: string, f: (q: any) => any = q => q) => {
    const { data, error } = await f(admin.from(table).select(cols).eq("user_id", uid)).limit(5000);
    if (error) throw error;
    return data ?? [];
  };
  const one = async (table: string, cols: string) => {
    const { data, error } = await admin.from(table).select(cols).eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return data;
  };
  const app = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch { return null; } }; // an app not set up is left out
  return {
    body: await app(() => rows("events", "value,unit,occurred_at", q => q.eq("metric", "weight").gte("occurred_at", addDays(start, -67) + "T00:00:00Z"))),
    money: await app(async () => ({
      tx: await rows("transactions", "occurred_on,amount,category", q => q.gte("occurred_on", from)),
      budget: (await app(() => one("money_profile", "budget")))?.budget ?? null,
      debts: (await app(() => rows("debts", "balance"))) ?? [],
    })),
    gym: await app(async () => ({
      sets: await rows("sets", "exercise_id,performed_on", q => q.gte("performed_on", from)),
      exercises: await rows("exercises", "id,name"),
      cardio: (await app(() => rows("cardio", "performed_on,kind,minutes,distance_km", q => q.gte("performed_on", from)))) ?? [],
    })),
    meal: await app(async () => ({
      entries: await rows("meal_entries", "eaten_on,calories,protein", q => q.gte("eaten_on", from)),
      goals: await app(() => one("meal_goals", "calories")),
    })),
    write: await app(() => rows("journal_entries", "written_on,rating,body", q => q.gte("written_on", from))),
    read: await app(() => rows("reading_log", "read_on,pages", q => q.gte("read_on", from))),
    sleep: await app(async () => ({
      nights: await rows("sleep_nights", "night,bedtime,wake_time,asleep_min", q => q.gte("night", from)),
      goal: Number((await app(() => one("sleep_goals", "goal_hours")))?.goal_hours) || 8,
    })),
  };
}

async function writeReview(text: string) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("Set the ANTHROPIC_API_KEY secret in Supabase (Edge Functions → Secrets).");
  const workspace = (Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "").trim();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01",
      "content-type": "application/json", ...(workspace ? { "anthropic-workspace-id": workspace } : {}),
    },
    body: JSON.stringify({
      model: "claude-opus-5-5", max_tokens: 16000, fallbacks: "default",
      system: `${ROLE}\n\nRules: Use only the data given; do not invent numbers. Write in second person, plainly, no exclamation marks, no emoji. Each item one or two short sentences. If fewer than three days have anything logged, say so in the headline and make next week's focus logging consistently.`,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Here is my week:\n\n${text}` }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude ${res.status}: ${out?.error?.message ?? "request failed"}`);
  if (out.stop_reason === "refusal" || out.stop_reason === "max_tokens") throw new Error(`Claude stopped: ${out.stop_reason}`);
  const v = JSON.parse((out.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  return {
    headline: String(v.headline ?? ""), wins: (v.wins ?? []).slice(0, 3).map(String),
    watch: (v.watch ?? []).slice(0, 3).map((w: any) => ({ what: String(w.what ?? ""), why: String(w.why ?? "") })),
    connection: String(v.connection ?? ""), next_week: String(v.next_week ?? ""), at: new Date().toISOString(), auto: true,
  };
}

// Everyone whose Sunday review is due and not yet written. Reports counts only, never content.
async function run() {
  const now = Date.now();
  const people = new Map<string, Record<string, unknown>>();
  for (const r of (await admin.from("user_settings").select("user_id,settings")).data ?? []) people.set(r.user_id, r.settings ?? {});
  for (const r of (await admin.from("push_subscriptions").select("user_id")).data ?? []) if (!people.has(r.user_id)) people.set(r.user_id, {});
  const report = { checked: people.size, written: 0, notified: 0, skipped: 0, failed: 0 };
  for (const [uid, settings] of people) {
    const d = due(now, settings);
    if (!d) continue;
    const { data: done } = await admin.from("weekly_reviews").select("week_start").eq("user_id", uid).eq("week_start", d.weekStart).maybeSingle();
    if (done) continue;
    try {
      const { text, loggedDays } = summary(await weekData(uid, d.weekStart), settings, d.weekStart, d.today);
      if (!loggedDays) { report.skipped++; continue; } // nothing logged all week: no review, no notification
      const review = await writeReview(text);
      const { error } = await admin.from("weekly_reviews").insert({ user_id: uid, week_start: d.weekStart, review, source: "auto" });
      if (error) { if (error.code === "23505") continue; throw error; } // written in the meantime (e.g. by the button)
      report.written++;
      report.notified += await notify(uid, { title: "Your weekly review is ready", body: review.headline.slice(0, 180), url: "/#week" });
    } catch (e) {
      report.failed++; // tried again next hour while it's still Sunday evening
      console.error("weekly review failed", uid, e instanceof Error ? e.message : String(e));
    }
  }
  return report;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const action = new URL(req.url).searchParams.get("action") ?? "run";
  try {
    if (action === "key") return json({ publicKey: (await vapid()).public_key });
    if (action === "test") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data } = await admin.auth.getUser(token);
      if (!data?.user) return json({ error: "Sign in first." }, 401);
      const sent = await notify(data.user.id, { title: "YOU", body: "Notifications are on. Your weekly review will arrive here on Sundays.", url: "/#week" });
      return json({ sent });
    }
    if (action === "run") return json(await run());
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
