// The weekly review's week: which week it is, whether it's time to write it, and the text Claude reads.
// The same week and wording as the review YOU writes when you press the button (you.js weekStats/weekSummary),
// worked out on the server for the automatic Sunday review. No imports, so it also runs under Node for tests.

const DAY = 86400000;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(parseDay(s).getTime() + n * DAY));
const weekdayOf = s => parseDay(s).getUTCDay(); // 0 Sunday
export const weekStart = s => addDays(s, -((weekdayOf(s) + 6) % 7));
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDay = s => WD[weekdayOf(s)];

// Your time zone from YOU's settings, or, on Automatic, the one your device reported.
const zoneOf = settings => (settings && (settings.timeZone || settings.deviceZone)) || 'UTC';
const dayEndsOf = settings => { const d = Number(settings && settings.dayEnds); return Number.isInteger(d) && d >= 0 && d <= 6 ? d : 0; };

// The calendar parts of a moment in a time zone.
function parts(ms, zone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value; return p;
}
// The day a moment belongs to, with the day running until dayEnds o'clock (as in YOU's settings).
export function dayOf(ms, settings) {
  const p = parts(new Date(ms).getTime() - dayEndsOf(settings) * 3600000, zoneOf(settings));
  return `${p.year}-${p.month}-${p.day}`;
}

// Time to write this week's review: Sunday (your day), at or after your chosen hour.
export function due(nowMs, settings) {
  const s = settings || {};
  if (s.reviewAuto === false) return null;
  const hour = Number.isInteger(Number(s.reviewHour)) ? Number(s.reviewHour) : 18;
  const today = dayOf(nowMs, s);
  if (weekdayOf(today) !== 0) return null;
  const p = parts(nowMs, zoneOf(s)), h = Number(p.hour) % 24;
  // Past midnight but before the day ends still counts as Sunday evening.
  const late = p.weekday !== 'Sun';
  if (!late && h < hour) return null;
  return { weekStart: weekStart(today), today };
}

const r0 = n => String(Math.round(Number(n) || 0));
const r1 = n => { const v = Math.round((Number(n) || 0) * 10) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
const hm = m => { m = Math.round(Number(m) || 0); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMoney = n => money.format(Math.round(n));
const LB = 0.45359237;
const toUnit = (v, from, to) => { const f = String(from || 'lbs').toLowerCase().startsWith('k') ? 'kg' : 'lbs'; v = Number(v); return f === to ? v : to === 'kg' ? v * LB : v / LB; };

function range(start, today) {
  const end = addDays(start, 6);
  return { start, end, until: end < today ? end : today, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
}
const inRange = (d, r) => d >= r.start && d <= r.end;

// Each app's week, from rows shaped like YOU's reads (data.<app> = rows or null when the app isn't set up).
function weekStats(data, r, settings) {
  const U = settings.weight === 'kg' ? 'kg' : 'lbs', metric = settings.length === 'metric';
  const dist = km => `${r1(metric ? km : km / 1.609344)} ${metric ? 'km' : 'mi'}`;
  const bodyDay = x => dayOf(Date.parse(x.occurred_at), settings);
  const S = {};
  if (data.body) { const all = data.body, inW = all.filter(x => inRange(bodyDay(x), r)).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1), before = all.filter(x => bodyDay(x) < r.start).sort((a, b) => a.occurred_at < b.occurred_at ? 1 : -1)[0];
    const last = inW.at(-1), base = before || inW[0], w = x => toUnit(x.value, x.unit, U);
    S.body = { n: inW.length, last: last ? w(last) : null, unit: U, change: last && base && base !== last ? w(last) - w(base) : null, byDay: Object.fromEntries(inW.map(x => [bodyDay(x), r1(w(x))])) }; }
  if (data.money) { const { tx, budget, debts = [] } = data.money, inW = tx.filter(x => inRange(x.occurred_on, r));
    const plan = ((budget && budget.allocations) || []).filter(a => a.kind === 'need' || a.kind === 'want').reduce((a, x) => a + Number(x.amount), 0);
    const byDay = {}, cats = {}; for (const x of inW) { byDay[x.occurred_on] = (byDay[x.occurred_on] || 0) + Number(x.amount); cats[x.category] = (cats[x.category] || 0) + Number(x.amount); }
    S.money = { spent: inW.reduce((a, x) => a + Number(x.amount), 0), weekBudget: plan ? plan * 12 / 52 : null, debt: debts.reduce((a, d) => a + Number(d.balance), 0), hasDebts: debts.length > 0, byDay, cats }; }
  if (data.gym) { const { sets, exercises, cardio = [] } = data.gym, name = id => (exercises.find(e => e.id === id) || {}).name || 'exercise', s2 = sets.filter(x => inRange(x.performed_on, r)), c2 = cardio.filter(x => inRange(x.performed_on, r));
    const byDay = {}; for (const x of s2) (byDay[x.performed_on] = byDay[x.performed_on] || new Set()).add(name(x.exercise_id));
    for (const x of c2) (byDay[x.performed_on] = byDay[x.performed_on] || new Set()).add(`${x.kind} ${Math.round(x.minutes)} min${x.distance_km ? ` ${dist(Number(x.distance_km))}` : ''}`);
    const km = c2.reduce((a, x) => a + Number(x.distance_km || 0), 0);
    S.gym = { days: Object.keys(byDay).length, sets: s2.length, cardioMin: c2.reduce((a, x) => a + Number(x.minutes), 0), cardioDist: km ? dist(km) : '', byDay }; }
  if (data.meal) { const { entries, goals } = data.meal, goal = goals ? Number(goals.calories) : 2000, inW = entries.filter(x => inRange(x.eaten_on, r));
    const byDay = {}; for (const x of inW) { const d = byDay[x.eaten_on] = byDay[x.eaten_on] || { c: 0, p: 0 }; d.c += Number(x.calories); d.p += Number(x.protein); }
    const days = Object.values(byDay); S.meal = { logged: days.length, avg: days.length ? days.reduce((a, d) => a + d.c, 0) / days.length : null, protein: days.length ? days.reduce((a, d) => a + d.p, 0) / days.length : null, onGoal: days.filter(d => d.c <= goal).length, goal, byDay }; }
  if (data.write) { const inW = data.write.filter(x => inRange(x.written_on, r));
    S.write = { n: inW.length, avg: inW.length ? inW.reduce((a, x) => a + x.rating, 0) / inW.length : null, byDay: Object.fromEntries(inW.map(x => [x.written_on, x])) }; }
  if (data.read) { const inW = data.read.filter(x => inRange(x.read_on, r)); const byDay = {}; for (const x of inW) byDay[x.read_on] = (byDay[x.read_on] || 0) + Number(x.pages);
    S.read = { pages: inW.reduce((a, x) => a + Number(x.pages), 0), days: Object.keys(byDay).length, byDay }; }
  if (data.sleep) { const { nights, goal } = data.sleep, inW = nights.filter(x => inRange(x.night, r));
    S.sleep = { n: inW.length, avg: inW.length ? inW.reduce((a, x) => a + Number(x.asleep_min), 0) / inW.length : null, met: inW.filter(x => Number(x.asleep_min) >= goal * 60).length, goal, byDay: Object.fromEntries(inW.map(x => [x.night, x])) }; }
  return S;
}

// The text Claude reads: the week against the week before, then every day side by side.
export function summary(data, settings, start, today) {
  const s = settings || {}, zone = zoneOf(s);
  const clock = ts => new Date(ts).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  const r = range(start, today), S = weekStats(data, r, s), P = weekStats(data, range(addDays(start, -7), today), s);
  const L = [`Week ${r.start} to ${r.end}${r.until < r.end ? ` (so far, through ${r.until})` : ''}. Currency USD.`];
  if (S.body) L.push(`BODY: ${S.body.n} weight readings${S.body.change != null ? `, change ${S.body.change > 0 ? '+' : ''}${r1(S.body.change)} ${S.body.unit} to ${r1(S.body.last)}` : ''}.`);
  if (S.money) L.push(`MONEY: spent ${fmtMoney(S.money.spent)} (week before ${fmtMoney((P.money && P.money.spent) || 0)})${S.money.weekBudget ? `, weekly budget ${fmtMoney(S.money.weekBudget)}` : ''}. By category: ${Object.entries(S.money.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtMoney(v)}`).join(', ') || 'none'}.${S.money.hasDebts ? ` Debt left ${fmtMoney(S.money.debt)}.` : ''}`);
  if (S.gym) L.push(`GYM: ${S.gym.days} workout days (week before ${P.gym ? P.gym.days : 0}), ${S.gym.sets} sets, ${r0(S.gym.cardioMin)} cardio minutes${S.gym.cardioDist ? `, ${S.gym.cardioDist}` : ''}.`);
  if (S.meal) L.push(`MEAL: ${S.meal.logged} days logged, average ${S.meal.avg != null ? r0(S.meal.avg) : 'n/a'} kcal against a ${r0(S.meal.goal)} goal, ${S.meal.onGoal} days within it, protein ${S.meal.protein != null ? r0(S.meal.protein) : 'n/a'} g a day.`);
  if (S.write) L.push(`WRITE: ${S.write.n} entries, average rating ${S.write.avg != null ? r1(S.write.avg) : 'n/a'} (week before ${P.write && P.write.avg != null ? r1(P.write.avg) : 'n/a'}).`);
  if (S.read) L.push(`READ: ${S.read.pages} pages on ${S.read.days} days (week before ${P.read ? P.read.pages : 0} pages).`);
  if (S.sleep) L.push(`SLEEP (Apple Health; each night is listed on the morning woken): ${S.sleep.n} nights, average ${S.sleep.avg != null ? hm(S.sleep.avg) : 'n/a'} asleep (week before ${P.sleep && P.sleep.avg != null ? hm(P.sleep.avg) : 'n/a'}), ${S.sleep.met} at the ${r1(S.sleep.goal)} h goal.`);
  L.push('\nDay by day:');
  let logged = 0;
  for (const d of r.days) { if (d > r.until) break; const x = [];
    if (S.body && S.body.byDay[d] != null) x.push(`weight ${S.body.byDay[d]}`);
    if (S.money && S.money.byDay[d]) x.push(`spent ${fmtMoney(S.money.byDay[d])}`);
    if (S.gym && S.gym.byDay[d]) x.push(`trained ${[...S.gym.byDay[d]].join('/')}`);
    if (S.meal && S.meal.byDay[d]) x.push(`ate ${r0(S.meal.byDay[d].c)} kcal, ${r0(S.meal.byDay[d].p)} g protein`);
    if (S.write && S.write.byDay[d]) { const j = S.write.byDay[d]; const b = (j.body || '').trim(); x.push(`rated ${j.rating}/10${b ? ` "${b.slice(0, 160).replace(/\s+/g, ' ')}${b.length > 160 ? '…' : ''}"` : ''}`); }
    if (S.read && S.read.byDay[d]) x.push(`read ${S.read.byDay[d]} pages`);
    if (S.sleep && S.sleep.byDay[d]) { const n = S.sleep.byDay[d]; x.push(`slept ${hm(n.asleep_min)} the night before (bed ${clock(n.bedtime)}, up ${clock(n.wake_time)})`); }
    if (x.length) logged++;
    L.push(`${d} (${shortDay(d)}): ${x.join('; ') || 'nothing logged'}`); }
  return { text: L.join('\n'), loggedDays: logged };
}
