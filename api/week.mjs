// Your weekly review. The browser sends one week across all seven apps, day by day; Claude writes what went
// well, what to watch, one connection between the apps, and a focus for next week.
// Runs on Vercel so the API key never reaches the browser. Only answers signed-in users.
import Anthropic from '@anthropic-ai/sdk';

const ROLE = `You are a calm, honest coach writing one person's weekly review across seven logs: body weight, spending, training, food, a daily journal rating with notes, reading, and sleep from Apple Health (each night is listed on the morning they woke). Compare the week with the one before where the data allows. Your most useful job is the connection the single-app coaches cannot see: a low-rated day that follows a skipped workout or a poor night of eating, spending that spikes on bad days, weight moving while food logging thins out, reading that stops when training stops, a short night before a low-rated day, a skipped workout, or a heavy-eating day. Only state a connection the days actually show; if none is clear, leave it empty rather than stretch. Name the apps and the days. Be warm and plain, never preachy. Do not give medical or financial advice. If the journal suggests crisis or self-harm, say gently that this is beyond what a weekly review can help with.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'wins', 'watch', 'connection', 'next_week'],
  properties: {
    headline: { type: 'string', description: 'One or two plain sentences: how the week went overall, with the key numbers.' },
    wins: { type: 'array', items: { type: 'string' }, description: 'One to three specific things that went well, each one short sentence citing the data.' },
    watch: {
      type: 'array', description: 'One to three things to watch or change.',
      items: { type: 'object', additionalProperties: false, required: ['what', 'why'], properties: { what: { type: 'string', description: 'The thing, as a short instruction.' }, why: { type: 'string', description: 'The evidence in the week, one short sentence.' } } }
    },
    connection: { type: 'string', description: 'One pattern linking two or more apps, naming the days. Empty string if the week shows none.' },
    next_week: { type: 'string', description: 'The single focus for next week, concrete enough to act on.' }
  }
};

async function verifyUser(request) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const auth = request.headers.authorization || '';
  if (!url || !key || !auth.startsWith('Bearer ')) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: auth } });
  return r.ok;
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).end(JSON.stringify({ error: 'Method not allowed.' })); }
  if (!process.env.ANTHROPIC_API_KEY) return response.status(503).end(JSON.stringify({ error: 'Set ANTHROPIC_API_KEY in Vercel to turn on the weekly review.' }));
  if (!(await verifyUser(request))) return response.status(401).end(JSON.stringify({ error: 'Sign in to write your weekly review.' }));

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 40000) : '';
  if (!summary.trim()) return response.status(400).end(JSON.stringify({ error: 'Nothing logged this week yet.' }));

  // An organization-level key must name a workspace; a key created inside a workspace does not.
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
  const client = new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
  try {
    const result = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${ROLE}\n\nRules: Use only the data given; do not invent numbers. Write in second person, plainly, no exclamation marks, no emoji. Each item one or two short sentences. If fewer than three days have anything logged, say so in the headline and make next week's focus logging consistently.`,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Here is my week:\n\n${summary}` }]
    });
    if (result.stop_reason === 'refusal') return response.status(422).end(JSON.stringify({ error: 'The review could not be written from this. Try again later.' }));
    if (result.stop_reason === 'max_tokens') return response.status(502).end(JSON.stringify({ error: 'The review came back incomplete. Try again.' }));
    const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const v = JSON.parse(text);
    return response.status(200).end(JSON.stringify({
      headline: String(v.headline || ''),
      wins: (v.wins || []).slice(0, 3).map(String),
      watch: (v.watch || []).slice(0, 3).map(w => ({ what: String(w.what || ''), why: String(w.why || '') })),
      connection: String(v.connection || ''),
      next_week: String(v.next_week || ''),
      at: new Date().toISOString()
    }));
  } catch (error) {
    console.error('week error', error?.status, error?.message);
    const status = error?.status === 429 ? 429 : error?.status === 401 ? 401 : 502;
    const detail = (error?.message || String(error)).slice(0, 300);
    const msg = status === 429 ? 'Reviews are busy. Try again in a minute.' : status === 401 ? 'The ANTHROPIC_API_KEY in Vercel was rejected. Check the key and redeploy.' : `The review could not be written: ${detail}`;
    return response.status(status).end(JSON.stringify({ error: msg }));
  }
}
