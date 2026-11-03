// YOU. Reads what the seven apps wrote and shows one number each. Nothing is written from here.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APPS=['body','money','gym','meal','write','read','sleep'];
const isoDay=d=>{ const x=new Date(d); return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const today=()=>isoDay(new Date());
const parseDay=s=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays=(s,n)=>isoDay(new Date(parseDay(s).getTime()+n*86400000+3600000*6));
const weekStart=s=>addDays(s,-((parseDay(s).getDay()+6)%7));
const shortDate=s=>parseDay(s).toLocaleDateString([], {month:'short',day:'numeric'});
const r0=n=>String(Math.round(Number(n)||0)); const r1=n=>{ const v=Math.round((Number(n)||0)*10)/10; return Number.isInteger(v)?String(v):v.toFixed(1); };
const currency=new Intl.NumberFormat([], {style:'currency',currency:'USD',maximumFractionDigits:0});
// "7h 05m" from minutes asleep; clock time from a timestamp.
const hm=m=>{ m=Math.round(Number(m)||0); return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`; };
const clock=ts=>new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const WORDS={1:'Awful',2:'Rough',3:'Bad',4:'Meh',5:'Okay',6:'Fine',7:'Good',8:'Great',9:'Excellent',10:'Perfect'};

let client=null,user=null,busy=false,authSub=null,connecting=null,storageCleanup=null,urls={},loadId=0;
let data={};

function message(id,text,kind=''){ $(id).textContent=text; $(id).className='message'+(kind?' '+kind:''); }

// ---- connection: the public settings come from /api/config ----
function projectConfig(v){ const url=typeof v?.url==='string'?v.url.trim().replace(/\/$/,''):'', key=typeof v?.key==='string'?v.key.trim():''; if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('This page needs its Supabase connection set up in Vercel.'); urls=v.urls&&typeof v.urls==='object'?v.urls:{}; return {url,key}; }
async function connect(){
  if(client)return client; if(connecting)return connecting;
  connecting=(async()=>{ let r; try{ r=await fetch('/api/config',{cache:'no-store'}); }catch{ throw new Error('Could not connect. Check your internet connection and try again.'); }
    if(!r.ok) throw new Error('This page needs its Supabase connection set up in Vercel.'); const c=makeClient(projectConfig(await r.json())); applyLinks(); return c; })();
  try{ return await connecting; } finally{ connecting=null; }
}
function makeClient(config){
  if(!window.supabase) throw new Error('The connection library could not load. Reload the page.');
  const storageKey='you.auth.'+new URL(config.url).hostname, storage=window.localStorage;
  authSub?.unsubscribe(); client?.auth.stopAutoRefresh(); storageCleanup?.();
  client=supabase.createClient(config.url,config.key,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const mine=client;
  authSub=client.auth.onAuthStateChange((_e,session)=>{ setTimeout(()=>{ if(client!==mine)return; setUser(session&&storage.getItem(storageKey)?session.user:null); },0); }).data.subscription;
  const changed=e=>{ if(client===mine&&e.storageArea===storage&&(e.key===storageKey||e.key===null)&&e.newValue===null)setUser(null); };
  window.addEventListener('storage',changed); storageCleanup=()=>window.removeEventListener('storage',changed);
  return client;
}
function applyLinks(){
  const missing=[];
  for(const app of APPS){ const a=$('app-'+app); if(urls[app]){ a.href=urls[app]; a.classList.remove('off'); a.removeAttribute('aria-disabled'); } else { a.href='#'; a.classList.add('off'); a.setAttribute('aria-disabled','true'); missing.push('URL_'+app.toUpperCase()); } }
  $('setup').hidden=!missing.length; if(missing.length) $('setup').innerHTML=`To make the tiles open the apps, add ${missing.map(m=>`<code>${m}</code>`).join(', ')} in this project's Vercel environment variables, each set to that app's address, then redeploy.`;
}
document.addEventListener('click',e=>{ const a=e.target.closest('a.app.off'); if(a) e.preventDefault(); });
function setUser(next){
  if(next?.id===user?.id)return;
  user=next; loadId++;
  $('connect-open').hidden=!!user; $('sign-out').hidden=!user; $('refresh').hidden=!user;
  $('connection-status').textContent=user?'Connected':'Your record'; $('connection-status').classList.toggle('connected',!!user);
  if(!user){ data={}; render(); } else load();
  window.coachUser?.(user?.id);
}
$('connect-open').onclick=()=>{ $('connection-dialog').showModal(); $('email').focus(); };
$('connect-close').onclick=()=>{ if(!busy)$('connection-dialog').close(); };
$('connection-dialog').addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
$('connect-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return; busy=true; $('connect-submit').disabled=true; message('connect-message','Signing in…');
  try{ const db=await connect(); const {data:d,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error)throw error; $('password').value=''; setUser(d.user); $('connection-dialog').close(); message('connect-message',''); }
  catch(err){ message('connect-message',err.message||'Could not sign in.','error'); }
  finally{ busy=false; $('connect-submit').disabled=false; }
});
$('sign-out').onclick=async()=>{ if(!client||busy)return; busy=true; try{ const {error}=await client.auth.signOut({scope:'local'}); if(error)throw error; setUser(null); }catch(err){ message('history-message',err.message,'error'); } finally{ busy=false; } };
$('refresh').onclick=()=>{ if(user) load(); };

// ---- reading: each app's table on its own, so one missing app never blanks the others ----
async function readAll(make){ const all=[]; let from=0; for(;;){ const {data:d,error,count}=await make().range(from,from+999); if(error)throw error; all.push(...d); from+=d.length; if(from>=count||!d.length)return all; } }
async function load(){
  const id=++loadId; message('history-message','');
  let db; try{ db=await connect(); }catch(err){ message('history-message',err.message,'error'); return; }
  const since90=addDays(today(),-89), since60=addDays(today(),-59);
  const reads={
    body: ()=>readAll(()=>db.from('events').select('metric,value,unit,occurred_at',{count:'exact'}).eq('metric','weight').gte('occurred_at',since90+'T00:00:00Z').order('occurred_at',{ascending:false})),
    money: async()=>({tx:await readAll(()=>db.from('transactions').select('occurred_on,amount,category,merchant',{count:'exact'}).gte('occurred_on',since60).order('occurred_on',{ascending:false})),subs:await readAll(()=>db.from('subscriptions').select('name,amount,cadence,active',{count:'exact'}).order('name')),budget:(await db.from('money_profile').select('budget').maybeSingle()).data?.budget||null,debts:await readAll(()=>db.from('debts').select('name,balance',{count:'exact'}).order('name')).catch(()=>[])}),
    gym: async()=>({sets:await readAll(()=>db.from('sets').select('exercise_id,performed_on,weight,reps',{count:'exact'}).gte('performed_on',since60).order('performed_on',{ascending:false})),exercises:await readAll(()=>db.from('exercises').select('id,name',{count:'exact'}).order('name')),cardio:await readAll(()=>db.from('cardio').select('performed_on,kind,minutes,calories',{count:'exact'}).gte('performed_on',since60).order('performed_on',{ascending:false})).catch(()=>[])}),
    meal: async()=>({entries:await readAll(()=>db.from('meal_entries').select('eaten_on,calories,protein,carbs,fat',{count:'exact'}).gte('eaten_on',since60).order('eaten_on',{ascending:false})),goals:(await db.from('meal_goals').select('*').maybeSingle()).data}),
    write: ()=>readAll(()=>db.from('journal_entries').select('written_on,rating,body',{count:'exact'}).gte('written_on',since60).order('written_on',{ascending:false})),
    read: async()=>({books:await readAll(()=>db.from('books').select('title,author,status,rating,finished_on',{count:'exact'}).order('updated_at',{ascending:false})),logs:await readAll(()=>db.from('reading_log').select('read_on,pages',{count:'exact'}).gte('read_on',since60).order('read_on',{ascending:false})).catch(()=>[])}),
    sleep: async()=>({nights:await readAll(()=>db.from('sleep_nights').select('night,bedtime,wake_time,asleep_min,deep_min,rem_min,resting_hr',{count:'exact'}).gte('night',since60).order('night',{ascending:false})),goal:Number((await db.from('sleep_goals').select('goal_hours').maybeSingle()).data?.goal_hours)||8})
  };
  const results=await Promise.allSettled(APPS.map(a=>reads[a]()));
  if(id!==loadId)return;
  data={}; for(let i=0;i<APPS.length;i++){ const r=results[i]; data[APPS[i]]=r.status==='fulfilled'?{ok:true,v:r.value}:{ok:false,err:r.reason?.message||'unavailable'}; }
  render();
}

// ---- one number per app ----
function tile(app,value,note,label,unit){ $(app+'-value').innerHTML=esc(value)+(unit?`<small>${esc(unit)}</small>`:''); $(app+'-note').textContent=note; $(app+'-label').textContent=label||''; }
function notSetUp(app,what){ const d=data[app]; if(!d) { tile(app,'—','Sign in to see this.'); return true; } if(!d.ok){ const missing=/relation .* does not exist|schema cache/i.test(d.err); tile(app,'—',missing?`${what} not set up yet.`:'Could not load.'); return true; } return false; }
let loggedToday=0;
function render(){
  const t=today(); loggedToday=0; $('date-label').textContent=new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
  // BODY: latest weight and the move since last week
  if(!notSetUp('body','BODY')){ const w=data.body.v; if(!w.length) tile('body','—','No readings yet.','weight'); else { const latest=w[0]; const d=latest.occurred_at.slice(0,10); const weekAgo=w.find(r=>r.occurred_at.slice(0,10)<=addDays(d,-6)); const diff=weekAgo?Number(latest.value)-Number(weekAgo.value):null; tile('body',r1(latest.value),`${d===t?'today':shortDate(d)}${diff!==null?` · ${diff>0?'+':''}${r1(diff)} ${latest.unit} vs a week ago`:''}`,'weight',latest.unit); if(d===t) loggedToday++; } }
  // MONEY: spent this month
  if(!notSetUp('money','MONEY')){ const {tx,subs}=data.money.v; const ms=t.slice(0,8)+'01'; const month=tx.filter(r=>r.occurred_on>=ms); const tot=month.reduce((a,r)=>a+Number(r.amount),0); const todayTot=tx.filter(r=>r.occurred_on===t).reduce((a,r)=>a+Number(r.amount),0); const subM=subs.filter(s=>s.active).reduce((a,s)=>a+(s.cadence==='yearly'?Number(s.amount)/12:s.cadence==='weekly'?Number(s.amount)*52/12:Number(s.amount)),0); tile('money',currency.format(tot),`this month · ${todayTot?currency.format(todayTot)+' today':'nothing today'} · ${currency.format(subM)} in subscriptions`,'spent'); if(todayTot) loggedToday++; }
  // GYM: workouts this week
  if(!notSetUp('gym','GYM')){ const {sets,cardio=[]}=data.gym.v; const days=[...new Set(sets.map(s=>s.performed_on).concat(cardio.map(c=>c.performed_on)))].sort().reverse(); const ws=weekStart(t); const wk=days.filter(d=>d>=ws).length; tile('gym',String(wk),days[0]?`this week · last workout ${days[0]===t?'today':shortDate(days[0])}`:'this week · nothing logged yet','workouts',wk===1?'workout':'workouts'); if(days[0]===t) loggedToday++; }
  // MEAL: calories today against the goal
  if(!notSetUp('meal','MEAL')){ const {entries,goals}=data.meal.v; const rows=entries.filter(r=>r.eaten_on===t); const cal=rows.reduce((a,r)=>a+Number(r.calories),0); const goal=goals?Number(goals.calories):2000; const prot=rows.reduce((a,r)=>a+Number(r.protein),0); tile('meal',r0(cal),rows.length?`of ${r0(goal)} kcal today · ${r0(prot)} g protein · ${rows.length} item${rows.length===1?'':'s'}`:`of ${r0(goal)} kcal · nothing logged today`,'calories','kcal'); if(rows.length) loggedToday++; }
  // WRITE: today's or latest rating
  if(!notSetUp('write','WRITE')){ const e=data.write.v; const latest=e[0]; if(!latest) tile('write','—','No entries yet.','today'); else { tile('write',`${latest.rating}`,`${latest.written_on===t?'today':latest.written_on===addDays(t,-1)?'yesterday':shortDate(latest.written_on)} · ${WORDS[latest.rating]}`,'rated','/10'); if(latest.written_on===t) loggedToday++; } }
  // READ: finished this year, reading now
  if(!notSetUp('read','READ')){ const b=data.read.v.books; const y=t.slice(0,4); const pagesToday=data.read.v.logs.filter(l=>l.read_on===t).reduce((a,l)=>a+Number(l.pages),0); const fin=b.filter(x=>x.status==='finished'&&(x.finished_on||'').startsWith(y)).length; const now=b.filter(x=>x.status==='reading'); tile('read',String(fin),now.length?`finished in ${y} · reading ${now.map(x=>x.title).slice(0,2).join(', ')}`:`finished in ${y} · nothing open`,'books',fin===1?'book':'books'); if(pagesToday){ $('read-note').textContent+=` · ${pagesToday} page${pagesToday===1?'':'s'} today`; loggedToday++; } }
  // SLEEP: last night from Apple Health, against your goal. It logs itself, so a night recorded this morning counts as today.
  if(!notSetUp('sleep','SLEEP')){ const {nights,goal}=data.sleep.v; const last=nights[0]; if(!last) tile('sleep','—','No nights yet. Wear your watch to bed with Sleep on.','asleep'); else { const wk=nights.filter(n=>n.night>addDays(t,-7)); const avg=wk.length?wk.reduce((a,n)=>a+Number(n.asleep_min),0)/wk.length:null; tile('sleep',hm(last.asleep_min),`${last.night===t?'last night':`night before ${shortDate(last.night)}`} · ${clock(last.bedtime)} → ${clock(last.wake_time)}${avg!=null?` · ${hm(avg)} avg vs ${r1(goal)}h goal`:''}`,'asleep'); if(last.night===t) loggedToday++; } }
  // Streaks: days in a row with something logged in each app. READ counts days with pages logged, SLEEP nights recorded.
  const DAYS={ body:v=>v.map(r=>isoDay(r.occurred_at)), money:v=>v.tx.map(r=>r.occurred_on), gym:v=>v.sets.map(s=>s.performed_on).concat((v.cardio||[]).map(c=>c.performed_on)), meal:v=>v.entries.map(r=>r.eaten_on), write:v=>v.map(r=>r.written_on), read:v=>v.logs.map(l=>l.read_on), sleep:v=>v.nights.map(n=>n.night) };
  const FROM={body:-89,money:-59,gym:-59,meal:-59,write:-59,read:-59,sleep:-59};
  for(const app in DAYS) streak(app,data[app]?.ok?DAYS[app](data[app].v):null,addDays(t,FROM[app]));
  const signed=!!user; const apps=APPS.filter(a=>data[a]?.ok).length;
  $('today-count').textContent=signed?String(loggedToday):'—'; $('today-unit').textContent=`of ${apps||APPS.length} logged today`;
  $('today-note').textContent=signed?(apps<APPS.length?`${apps} of ${APPS.length} apps connected to this database.`:`All seven apps on one login.`):'Sign in to see all of it in one place.';
  $('side-today').textContent=signed?`${loggedToday}/${apps||APPS.length}`:'—';
  renderWeek();
}

// Counting back from today. Today isn't over, so a streak that only misses today is still alive and shows faded
// until something is logged. `since` is the first day read: a streak that reaches it shows as "N+".
function streakOf(days,since){ const has=new Set(days), t=today(); let d=has.has(t)?t:addDays(t,-1), n=0; while(d>=since&&has.has(d)){ n++; d=addDays(d,-1); } return {n,kept:has.has(t),more:d<since}; }
function streak(app,days,since){
  const el=$(app+'-streak'), s=days?streakOf(days,since):{n:0}; $('app-'+app).classList.toggle('has-streak',s.n>0); el.hidden=!s.n; if(!s.n)return;
  const n=s.n+(s.more?'+':''); el.textContent=`🔥 ${n}`; el.classList.toggle('waiting',!s.kept);
  el.title=s.kept?`${n} day${s.n===1?'':'s'} in a row`:`${n}-day streak. Log today to keep it.`; el.setAttribute('aria-label',el.title);
}

// What the coach reads: the last few weeks of every app, side by side.
function coachSummary(){
  const t=today(); const L=[]; const since=addDays(t,-27);
  const dayLine={}; const add=(d,s)=>{ if(d>=since) dayLine[d]=(dayLine[d]||[]).concat(s); };
  if(data.body?.ok){ const w=data.body.v; L.push(`BODY: ${w.length} weight readings in 90 days.${w[0]?` Latest ${w[0].value} ${w[0].unit} on ${w[0].occurred_at.slice(0,10)}.`:''}`); for(const r of w) add(r.occurred_at.slice(0,10),`weight ${r.value}${r.unit}`); }
  if(data.money?.ok){ const {tx,subs}=data.money.v; const ms=t.slice(0,8)+'01'; L.push(`MONEY: ${currency.format(tx.filter(r=>r.occurred_on>=ms).reduce((a,r)=>a+Number(r.amount),0))} this month, ${currency.format(tx.filter(r=>r.occurred_on>=since).reduce((a,r)=>a+Number(r.amount),0))} in 28 days. Subscriptions: ${subs.filter(s=>s.active).map(s=>`${s.name} ${currency.format(s.amount)}/${s.cadence}`).join(', ')||'none'}.`); const byDay={}; for(const r of tx){ byDay[r.occurred_on]=(byDay[r.occurred_on]||0)+Number(r.amount); } for(const [d,v] of Object.entries(byDay)) add(d,`spent ${currency.format(v)}`); }
  if(data.gym?.ok){ const {sets,exercises}=data.gym.v; const name=id=>exercises.find(e=>e.id===id)?.name||'exercise'; const byDay={}; for(const s of sets){ byDay[s.performed_on]=byDay[s.performed_on]||new Set(); byDay[s.performed_on].add(name(s.exercise_id)); } L.push(`GYM: ${Object.keys(byDay).length} lifting days in 60 days.`); for(const [d,ex] of Object.entries(byDay)) add(d,`trained ${[...ex].join('/')}`); for(const c of (data.gym.v.cardio||[])) add(c.performed_on,`cardio ${c.kind} ${Math.round(c.minutes)} min${c.calories!=null?` ${Math.round(c.calories)} kcal`:''}`); }
  if(data.meal?.ok){ const {goals}=data.meal.v; const entries=data.meal.v.entries.filter(r=>r.eaten_on>=addDays(t,-13)); const goal=goals?Number(goals.calories):2000; const byDay={}; for(const r of entries){ byDay[r.eaten_on]=byDay[r.eaten_on]||{c:0,p:0}; byDay[r.eaten_on].c+=Number(r.calories); byDay[r.eaten_on].p+=Number(r.protein); } L.push(`MEAL: goal ${r0(goal)} kcal/day${goals?`, protein ${r0(goals.protein)} g`:''}. ${Object.keys(byDay).length} of the last 14 days logged.`); for(const [d,v] of Object.entries(byDay)) add(d,`ate ${r0(v.c)} kcal (P ${r0(v.p)}g)${v.c>goal?' OVER goal':''}`); }
  if(data.write?.ok){ const e=data.write.v.filter(r=>r.written_on>=addDays(t,-29)); L.push(`WRITE: ${e.length} journal entries in 30 days, average rating ${e.length?r1(e.reduce((a,r)=>a+r.rating,0)/e.length):'none'}.`); for(const r of e) add(r.written_on,`rated day ${r.rating}/10${r.body?.trim()?` "${r.body.trim().slice(0,140).replace(/\s+/g,' ')}${r.body.length>140?'…':''}"`:''}`); }
  if(data.read?.ok){ const b=data.read.v.books; L.push(`READ: reading ${b.filter(x=>x.status==='reading').map(x=>x.title).join(', ')||'nothing'}; finished ${b.filter(x=>x.status==='finished'&&(x.finished_on||'')>=since).map(x=>`${x.title} (${x.rating}/10)`).join(', ')||'nothing'} in 28 days.`); for(const x of b) if(x.finished_on) add(x.finished_on,`finished reading ${x.title}`); }
  if(data.sleep?.ok){ const {nights,goal}=data.sleep.v; const n=nights.filter(x=>x.night>=since); L.push(`SLEEP (from Apple Health, keyed by the morning woken): goal ${r1(goal)} h. ${n.length} nights recorded in 28 days, average ${n.length?hm(n.reduce((a,x)=>a+Number(x.asleep_min),0)/n.length):'n/a'} asleep.`); for(const x of n) add(x.night,`slept ${hm(x.asleep_min)} the night before${x.deep_min!=null?` (deep ${hm(x.deep_min)}, REM ${hm(x.rem_min)})`:''}${x.resting_hr!=null?`, resting HR ${r0(x.resting_hr)}`:''}`); }
  L.push('\nDay by day, last 28 days (missing days had nothing logged anywhere):');
  for(let d=since; d<=t; d=addDays(d,1)) if(dayLine[d]) L.push(`${d}: ${dayLine[d].join('; ')}`);
  return L.join('\n');
}
// ---- your week: each app's week against the week before, the days you logged, and a review on request ----
let weekPick=null, weekBusy=false, weekError='';
const WEEK_APPS=[['body','BODY','#8fd3ff'],['money','MONEY','#8fe3b0'],['gym','GYM','#ff9b9b'],['meal','MEAL','#c9a7ff'],['write','WRITE','#ffd98a'],['read','READ','#ffb86b'],['sleep','SLEEP','#9aa8ff']];
// Last week, or this week on a Sunday when it's almost done.
const defaultWeek=()=>parseDay(today()).getDay()===0?'this':'last';
// 'this' and 'last', plus the week before each for comparisons: 'prev-this' is last week, 'prev-last' the one before.
function weekRange(which){ const cur=weekStart(today()), back={this:0,last:7,'prev-this':7,'prev-last':14}[which]??7, start=addDays(cur,-back), end=addDays(start,6); return {start,end,until:end<today()?end:today(),days:Array.from({length:7},(_,i)=>addDays(start,i))}; }
const inRange=(d,r)=>d>=r.start&&d<=r.end;
const bodyDay=r=>isoDay(r.occurred_at);
const fmtMoney=n=>currency.format(Math.round(n));
// Everything about one week that the cards, the grid and the review need.
function weekStats(r){
  const S={days:{}}; for(const d of r.days) S.days[d]={};
  const mark=(app,d)=>{ if(S.days[d]) S.days[d][app]=true; };
  if(data.body?.ok){ const all=data.body.v, inW=all.filter(x=>inRange(bodyDay(x),r)).sort((a,b)=>a.occurred_at<b.occurred_at?-1:1), before=all.filter(x=>bodyDay(x)<r.start).sort((a,b)=>a.occurred_at<b.occurred_at?1:-1)[0];
    inW.forEach(x=>mark('body',bodyDay(x))); const last=inW.at(-1), base=before||inW[0];
    S.body={n:inW.length,last:last?Number(last.value):null,unit:last?.unit||base?.unit||'',change:last&&base&&base!==last?Number(last.value)-Number(base.value):null,byDay:Object.fromEntries(inW.map(x=>[bodyDay(x),Number(x.value)]))}; }
  if(data.money?.ok){ const {tx,budget,debts=[]}=data.money.v, inW=tx.filter(x=>inRange(x.occurred_on,r)); inW.forEach(x=>mark('money',x.occurred_on));
    const plan=(budget?.allocations||[]).filter(a=>a.kind==='need'||a.kind==='want').reduce((a,x)=>a+Number(x.amount),0);
    const byDay={}; for(const x of inW) byDay[x.occurred_on]=(byDay[x.occurred_on]||0)+Number(x.amount);
    const cats={}; for(const x of inW) cats[x.category]=(cats[x.category]||0)+Number(x.amount);
    S.money={spent:inW.reduce((a,x)=>a+Number(x.amount),0),weekBudget:plan?plan*12/52:null,debt:debts.reduce((a,d)=>a+Number(d.balance),0),hasDebts:debts.length>0,byDay,cats}; }
  if(data.gym?.ok){ const {sets,exercises,cardio=[]}=data.gym.v, name=id=>exercises.find(e=>e.id===id)?.name||'exercise', s2=sets.filter(x=>inRange(x.performed_on,r)), c2=cardio.filter(x=>inRange(x.performed_on,r));
    s2.forEach(x=>mark('gym',x.performed_on)); c2.forEach(x=>mark('gym',x.performed_on));
    const byDay={}; for(const x of s2){ (byDay[x.performed_on]=byDay[x.performed_on]||new Set()).add(name(x.exercise_id)); } for(const x of c2){ (byDay[x.performed_on]=byDay[x.performed_on]||new Set()).add(`${x.kind} ${Math.round(x.minutes)} min`); }
    S.gym={days:Object.keys(byDay).length,sets:s2.length,cardioMin:c2.reduce((a,x)=>a+Number(x.minutes),0),byDay}; }
  if(data.meal?.ok){ const {entries,goals}=data.meal.v, goal=goals?Number(goals.calories):2000, inW=entries.filter(x=>inRange(x.eaten_on,r)); inW.forEach(x=>mark('meal',x.eaten_on));
    const byDay={}; for(const x of inW){ const d=byDay[x.eaten_on]=byDay[x.eaten_on]||{c:0,p:0}; d.c+=Number(x.calories); d.p+=Number(x.protein); }
    const days=Object.values(byDay); S.meal={logged:days.length,avg:days.length?days.reduce((a,d)=>a+d.c,0)/days.length:null,protein:days.length?days.reduce((a,d)=>a+d.p,0)/days.length:null,onGoal:days.filter(d=>d.c<=goal).length,goal,byDay}; }
  if(data.write?.ok){ const inW=data.write.v.filter(x=>inRange(x.written_on,r)); inW.forEach(x=>mark('write',x.written_on));
    const sorted=[...inW].sort((a,b)=>b.rating-a.rating); S.write={n:inW.length,avg:inW.length?inW.reduce((a,x)=>a+x.rating,0)/inW.length:null,best:sorted[0],worst:sorted.length>1?sorted.at(-1):null,byDay:Object.fromEntries(inW.map(x=>[x.written_on,x]))}; }
  if(data.read?.ok){ const inW=(data.read.v.logs||[]).filter(x=>inRange(x.read_on,r)); inW.forEach(x=>mark('read',x.read_on));
    const byDay={}; for(const x of inW) byDay[x.read_on]=(byDay[x.read_on]||0)+Number(x.pages); S.read={pages:inW.reduce((a,x)=>a+Number(x.pages),0),days:Object.keys(byDay).length,byDay}; }
  if(data.sleep?.ok){ const {nights,goal}=data.sleep.v, inW=nights.filter(x=>inRange(x.night,r)); inW.forEach(x=>mark('sleep',x.night));
    S.sleep={n:inW.length,avg:inW.length?inW.reduce((a,x)=>a+Number(x.asleep_min),0)/inW.length:null,met:inW.filter(x=>Number(x.asleep_min)>=goal*60).length,goal,byDay:Object.fromEntries(inW.map(x=>[x.night,x]))}; }
  return S;
}
// "+3" / "−2" against last week, green when it's the good direction.
function delta(now,before,goodUp,fmt=r0){ if(now==null||before==null) return ''; const d=now-before; if(Math.abs(d)<0.05) return ' · same as the week before'; return ` · <span class="${(d>0)===goodUp?'up':'down'}">${d>0?'+':'−'}${esc(fmt(Math.abs(d)))}</span> vs the week before`; }
const shortDay=d=>parseDay(d).toLocaleDateString([], {weekday:'short'});
function renderWeek(){
  const body=$('week-body'); if(!weekPick) weekPick=defaultWeek();
  document.querySelectorAll('[data-week]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.week===weekPick)));
  const r=weekRange(weekPick), fmtD=d=>parseDay(d).toLocaleDateString([], {month:'short',day:'numeric'});
  $('week-range').textContent=` · ${fmtD(r.start)} – ${fmtD(r.end)}`;
  if(!user){ body.innerHTML='<p class="coach-empty">Sign in to see your week across all seven apps.</p>'; return; }
  if(!Object.keys(data).length){ body.innerHTML='<p class="coach-empty">Loading your week…</p>'; return; }
  const S=weekStats(r), P=weekStats(weekRange(weekPick==='this'?'prev-this':'prev-last'));
  const card=(app,label,c,value,unit,note)=>`<div class="wcard" style="--c:${c}"><p>${label}</p><strong>${value}${unit?`<small>${unit}</small>`:''}</strong><small class="note">${note}</small></div>`;
  const off=app=>!data[app]?.ok;
  const cards=[
    off('body')?card('body','BODY','#8fd3ff','—','','not set up'):S.body.change!=null?card('body','BODY','#8fd3ff',`${S.body.change>0?'+':S.body.change<0?'−':''}${r1(Math.abs(S.body.change))}`,esc(S.body.unit),`now ${r1(S.body.last)} ${esc(S.body.unit)} · ${S.body.n} reading${S.body.n===1?'':'s'}`):card('body','BODY','#8fd3ff',S.body.n?r1(S.body.last):'—',S.body.n?esc(S.body.unit):'',S.body.n?`${S.body.n} reading this week`:'no readings this week'),
    off('money')?card('money','MONEY','#8fe3b0','—','','not set up'):card('money','MONEY','#8fe3b0',esc(fmtMoney(S.money.spent)),'spent',(S.money.weekBudget?`${S.money.spent<=S.money.weekBudget?`${esc(fmtMoney(S.money.weekBudget-S.money.spent))} under`:`<span class="down">${esc(fmtMoney(S.money.spent-S.money.weekBudget))} over</span>`} your ${esc(fmtMoney(S.money.weekBudget))} week`:'this week')+delta(S.money.spent,P.money?.spent,false,fmtMoney)+(S.money.hasDebts?` · ${esc(fmtMoney(S.money.debt))} debt left`:'')),
    off('gym')?card('gym','GYM','#ff9b9b','—','','not set up'):card('gym','GYM','#ff9b9b',String(S.gym.days),S.gym.days===1?'workout':'workouts',`${S.gym.sets} sets${S.gym.cardioMin?` · ${r0(S.gym.cardioMin)} min cardio`:''}${delta(S.gym.days,P.gym?.days,true)}`),
    off('meal')?card('meal','MEAL','#c9a7ff','—','','not set up'):card('meal','MEAL','#c9a7ff',S.meal.avg!=null?r0(S.meal.avg):'—',S.meal.avg!=null?'kcal/day':'',S.meal.logged?`${S.meal.onGoal} of ${S.meal.logged} logged days within ${r0(S.meal.goal)} · ${r0(S.meal.protein)} g protein`:'nothing logged this week'),
    off('write')?card('write','WRITE','#ffd98a','—','','not set up'):card('write','WRITE','#ffd98a',S.write.avg!=null?r1(S.write.avg):'—',S.write.avg!=null?'/10 avg':'',S.write.n?`best ${esc(shortDay(S.write.best.written_on))} ${S.write.best.rating}${S.write.worst?` · lowest ${esc(shortDay(S.write.worst.written_on))} ${S.write.worst.rating}`:''}${delta(S.write.avg,P.write?.avg,true,r1)}`:'no entries this week'),
    off('read')?card('read','READ','#ffb86b','—','','not set up'):card('read','READ','#ffb86b',String(S.read.pages),S.read.pages===1?'page':'pages',`${S.read.days} day${S.read.days===1?'':'s'} read${delta(S.read.pages,P.read?.pages,true)}`),
    off('sleep')?card('sleep','SLEEP','#9aa8ff','—','','not set up'):card('sleep','SLEEP','#9aa8ff',S.sleep.avg!=null?esc(hm(S.sleep.avg)):'—',S.sleep.avg!=null?'a night':'',S.sleep.n?`${S.sleep.met} of ${S.sleep.n} night${S.sleep.n===1?'':'s'} at your ${esc(r1(S.sleep.goal))}h goal${delta(S.sleep.avg,P.sleep?.avg,true,m=>m<60?`${r0(m)} min`:hm(m))}`:'no nights recorded this week'),
  ].join('');
  const t=today(), full=r.days.filter(d=>d<=t&&WEEK_APPS.every(([a])=>off(a)||S.days[d][a])).length, counted=r.days.filter(d=>d<=t).length;
  const grid=`<div class="grid-wrap"><table class="wgrid"><caption class="sr-only" style="position:absolute;left:-9999px">Days logged per app</caption><thead><tr><th></th>${r.days.map(d=>`<th scope="col">${esc(shortDay(d)).slice(0,2)}</th>`).join('')}</tr></thead><tbody>${WEEK_APPS.filter(([a])=>!off(a)).map(([a,label,c])=>`<tr style="--c:${c}"><th scope="row">${label}</th>${r.days.map(d=>`<td class="${d>t?'future':''}"><i class="${S.days[d][a]?'on':''}" aria-label="${S.days[d][a]?'logged':'not logged'}"></i></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const saved=loadReview(r.start);
  body.innerHTML=`<div class="week-cards">${cards}</div>${grid}<p class="week-note">${full} of ${counted} day${counted===1?'':'s'} with every app logged.</p>
  <div class="week-review"><div class="wr-head"><h3 style="margin:0">Weekly review</h3><button class="quiet-button" id="week-ask" type="button"${weekBusy?' disabled':''}>${saved?'Write it again ↗':'Write my weekly review ↗'}</button></div><div id="week-review-body">${saved?reviewHtml(saved):`<p class="coach-empty" style="margin-top:10px">Claude reads this week across all seven apps and tells you what went well, what to watch, and one connection between them. Nothing is sent until you press the button.</p>`}</div><p class="message${weekError?' error':''}" id="week-message" role="status" aria-live="polite">${weekBusy?'<span class="spinner"></span>Reading your week…':esc(weekError)}</p></div>`;
  $('week-ask').onclick=askWeek;
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-week]'); if(!b)return; weekPick=b.dataset.week; weekError=''; renderWeek(); });

// What the review reads: each app's week against the week before, then every day side by side.
function weekSummary(){
  const r=weekRange(weekPick), S=weekStats(r), P=weekStats(weekRange(weekPick==='this'?'prev-this':'prev-last'));
  const L=[`Week ${r.start} to ${r.end}${r.until<r.end?` (so far, through ${r.until})`:''}. Currency ${currency.resolvedOptions().currency}.`];
  if(S.body) L.push(`BODY: ${S.body.n} weight readings${S.body.change!=null?`, change ${S.body.change>0?'+':''}${r1(S.body.change)} ${S.body.unit} to ${r1(S.body.last)}`:''}.`);
  if(S.money) L.push(`MONEY: spent ${fmtMoney(S.money.spent)} (week before ${fmtMoney(P.money?.spent||0)})${S.money.weekBudget?`, weekly budget ${fmtMoney(S.money.weekBudget)}`:''}. By category: ${Object.entries(S.money.cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${fmtMoney(v)}`).join(', ')||'none'}.${S.money.hasDebts?` Debt left ${fmtMoney(S.money.debt)}.`:''}`);
  if(S.gym) L.push(`GYM: ${S.gym.days} workout days (week before ${P.gym?.days??0}), ${S.gym.sets} sets, ${r0(S.gym.cardioMin)} cardio minutes.`);
  if(S.meal) L.push(`MEAL: ${S.meal.logged} days logged, average ${S.meal.avg!=null?r0(S.meal.avg):'n/a'} kcal against a ${r0(S.meal.goal)} goal, ${S.meal.onGoal} days within it, protein ${S.meal.protein!=null?r0(S.meal.protein):'n/a'} g a day.`);
  if(S.write) L.push(`WRITE: ${S.write.n} entries, average rating ${S.write.avg!=null?r1(S.write.avg):'n/a'} (week before ${P.write?.avg!=null?r1(P.write.avg):'n/a'}).`);
  if(S.read) L.push(`READ: ${S.read.pages} pages on ${S.read.days} days (week before ${P.read?.pages??0} pages).`);
  if(S.sleep) L.push(`SLEEP (Apple Health; each night is listed on the morning woken): ${S.sleep.n} nights, average ${S.sleep.avg!=null?hm(S.sleep.avg):'n/a'} asleep (week before ${P.sleep?.avg!=null?hm(P.sleep.avg):'n/a'}), ${S.sleep.met} at the ${r1(S.sleep.goal)} h goal.`);
  L.push('\nDay by day:');
  for(const d of r.days){ if(d>r.until) break; const x=[];
    if(S.body?.byDay[d]!=null) x.push(`weight ${S.body.byDay[d]}`);
    if(S.money?.byDay[d]) x.push(`spent ${fmtMoney(S.money.byDay[d])}`);
    if(S.gym?.byDay[d]) x.push(`trained ${[...S.gym.byDay[d]].join('/')}`);
    if(S.meal?.byDay[d]) x.push(`ate ${r0(S.meal.byDay[d].c)} kcal, ${r0(S.meal.byDay[d].p)} g protein`);
    if(S.write?.byDay[d]){ const j=S.write.byDay[d]; x.push(`rated ${j.rating}/10${j.body?.trim()?` "${j.body.trim().slice(0,160).replace(/\s+/g,' ')}${j.body.length>160?'…':''}"`:''}`); }
    if(S.read?.byDay[d]) x.push(`read ${S.read.byDay[d]} pages`);
    if(S.sleep?.byDay[d]){ const n=S.sleep.byDay[d]; x.push(`slept ${hm(n.asleep_min)} the night before (bed ${clock(n.bedtime)}, up ${clock(n.wake_time)})`); }
    L.push(`${d} (${shortDay(d)}): ${x.join('; ')||'nothing logged'}`); }
  return L.join('\n');
}
const reviewKey=start=>`you.week.${user?.id}.${start}`;
function loadReview(start){ try{ return JSON.parse(localStorage.getItem(reviewKey(start))||'null'); }catch{ return null; } }
function reviewHtml(v){
  return `<p class="head">${esc(v.headline)}</p><div class="cols"><div><h3>Went well</h3><ul>${v.wins.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div><div><h3>Watch</h3><ul>${v.watch.map(w=>`<li><b>${esc(w.what)}</b>${esc(w.why)}</li>`).join('')}</ul></div></div>${v.connection?`<p class="link"><span>The connection</span>${esc(v.connection)}</p>`:''}<p class="link"><span>Next week</span>${esc(v.next_week)}</p><p class="week-note">Written ${esc(new Date(v.at).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}))} from your own logs, not medical or financial advice.</p>`;
}
async function askWeek(){
  if(weekBusy||!user)return; const r=weekRange(weekPick); weekBusy=true; weekError=''; renderWeek();
  try{
    const db=await connect(); const {data:{session}}=await db.auth.getSession(); if(!session?.access_token) throw new Error('Sign in again to write the review.');
    const res=await fetch('/api/week',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({summary:weekSummary()})});
    const j=await res.json().catch(()=>({})); if(!res.ok) throw new Error(j.error||'The review could not be written.');
    try{ localStorage.setItem(reviewKey(r.start),JSON.stringify(j)); }catch{}
  }catch(err){ weekError=err.message||'The review could not be written.'; }
  finally{ weekBusy=false; renderWeek(); }
}

window.coach={app:'you',note:'The coach reads the last few weeks from all seven apps, including short journal excerpts.',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};
// Show the score in the sidebar whenever the coach card renders one.
new MutationObserver(()=>{ const s=document.querySelector('#coach .coach-score'); $('side-score').textContent=s?s.firstChild.textContent.trim():'—'; }).observe($('coach-body'),{childList:true,subtree:true});

render();
connect().catch(err=>message('history-message',err.message,'error'));
})();
