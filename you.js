// YOU. Reads what the six apps wrote and shows one number each. Nothing is written from here.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APPS=['body','money','gym','meal','write','read'];
const isoDay=d=>{ const x=new Date(d); return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const today=()=>isoDay(new Date());
const parseDay=s=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays=(s,n)=>isoDay(new Date(parseDay(s).getTime()+n*86400000+3600000*6));
const weekStart=s=>addDays(s,-((parseDay(s).getDay()+6)%7));
const shortDate=s=>parseDay(s).toLocaleDateString([], {month:'short',day:'numeric'});
const r0=n=>String(Math.round(Number(n)||0)); const r1=n=>{ const v=Math.round((Number(n)||0)*10)/10; return Number.isInteger(v)?String(v):v.toFixed(1); };
const currency=new Intl.NumberFormat([], {style:'currency',currency:'USD',maximumFractionDigits:0});
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
    money: async()=>({tx:await readAll(()=>db.from('transactions').select('occurred_on,amount,category,merchant',{count:'exact'}).gte('occurred_on',since60).order('occurred_on',{ascending:false})),subs:await readAll(()=>db.from('subscriptions').select('name,amount,cadence,active',{count:'exact'}).order('name'))}),
    gym: async()=>({sets:await readAll(()=>db.from('sets').select('exercise_id,performed_on,weight,reps',{count:'exact'}).gte('performed_on',since60).order('performed_on',{ascending:false})),exercises:await readAll(()=>db.from('exercises').select('id,name',{count:'exact'}).order('name')),cardio:await readAll(()=>db.from('cardio').select('performed_on,kind,minutes,calories',{count:'exact'}).gte('performed_on',since60).order('performed_on',{ascending:false})).catch(()=>[])}),
    meal: async()=>({entries:await readAll(()=>db.from('meal_entries').select('eaten_on,calories,protein,carbs,fat',{count:'exact'}).gte('eaten_on',addDays(today(),-13)).order('eaten_on',{ascending:false})),goals:(await db.from('meal_goals').select('*').maybeSingle()).data}),
    write: ()=>readAll(()=>db.from('journal_entries').select('written_on,rating,body',{count:'exact'}).gte('written_on',addDays(today(),-29)).order('written_on',{ascending:false})),
    read: ()=>readAll(()=>db.from('books').select('title,author,status,rating,finished_on',{count:'exact'}).order('updated_at',{ascending:false}))
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
  if(!notSetUp('write','WRITE')){ const e=data.write.v; const latest=e[0]; const streak=(()=>{ let n=0,d=t; const has=x=>e.some(r=>r.written_on===x); if(!has(d)) d=addDays(d,-1); while(has(d)){ n++; d=addDays(d,-1); } return n; })(); if(!latest) tile('write','—','No entries yet.','today'); else { tile('write',`${latest.rating}`,`${latest.written_on===t?'today':latest.written_on===addDays(t,-1)?'yesterday':shortDate(latest.written_on)} · ${WORDS[latest.rating]} · ${streak}-day streak`,'rated','/10'); if(latest.written_on===t) loggedToday++; } }
  // READ: finished this year, reading now
  if(!notSetUp('read','READ')){ const b=data.read.v; const y=t.slice(0,4); const fin=b.filter(x=>x.status==='finished'&&(x.finished_on||'').startsWith(y)).length; const now=b.filter(x=>x.status==='reading'); tile('read',String(fin),now.length?`finished in ${y} · reading ${now.map(x=>x.title).slice(0,2).join(', ')}`:`finished in ${y} · nothing open`,'books',fin===1?'book':'books'); }
  const signed=!!user; const apps=APPS.filter(a=>data[a]?.ok).length;
  $('today-count').textContent=signed?String(loggedToday):'—'; $('today-unit').textContent=`of ${apps||6} logged today`;
  $('today-note').textContent=signed?(apps<6?`${apps} of 6 apps connected to this database.`:`All six apps on one login.`):'Sign in to see all of it in one place.';
  $('side-today').textContent=signed?`${loggedToday}/${apps||6}`:'—';
}

// What the coach reads: the last few weeks of every app, side by side.
function coachSummary(){
  const t=today(); const L=[]; const since=addDays(t,-27);
  const dayLine={}; const add=(d,s)=>{ if(d>=since) dayLine[d]=(dayLine[d]||[]).concat(s); };
  if(data.body?.ok){ const w=data.body.v; L.push(`BODY: ${w.length} weight readings in 90 days.${w[0]?` Latest ${w[0].value} ${w[0].unit} on ${w[0].occurred_at.slice(0,10)}.`:''}`); for(const r of w) add(r.occurred_at.slice(0,10),`weight ${r.value}${r.unit}`); }
  if(data.money?.ok){ const {tx,subs}=data.money.v; const ms=t.slice(0,8)+'01'; L.push(`MONEY: ${currency.format(tx.filter(r=>r.occurred_on>=ms).reduce((a,r)=>a+Number(r.amount),0))} this month, ${currency.format(tx.filter(r=>r.occurred_on>=since).reduce((a,r)=>a+Number(r.amount),0))} in 28 days. Subscriptions: ${subs.filter(s=>s.active).map(s=>`${s.name} ${currency.format(s.amount)}/${s.cadence}`).join(', ')||'none'}.`); const byDay={}; for(const r of tx){ byDay[r.occurred_on]=(byDay[r.occurred_on]||0)+Number(r.amount); } for(const [d,v] of Object.entries(byDay)) add(d,`spent ${currency.format(v)}`); }
  if(data.gym?.ok){ const {sets,exercises}=data.gym.v; const name=id=>exercises.find(e=>e.id===id)?.name||'exercise'; const byDay={}; for(const s of sets){ byDay[s.performed_on]=byDay[s.performed_on]||new Set(); byDay[s.performed_on].add(name(s.exercise_id)); } L.push(`GYM: ${Object.keys(byDay).length} lifting days in 60 days.`); for(const [d,ex] of Object.entries(byDay)) add(d,`trained ${[...ex].join('/')}`); for(const c of (data.gym.v.cardio||[])) add(c.performed_on,`cardio ${c.kind} ${Math.round(c.minutes)} min${c.calories!=null?` ${Math.round(c.calories)} kcal`:''}`); }
  if(data.meal?.ok){ const {entries,goals}=data.meal.v; const goal=goals?Number(goals.calories):2000; const byDay={}; for(const r of entries){ byDay[r.eaten_on]=byDay[r.eaten_on]||{c:0,p:0}; byDay[r.eaten_on].c+=Number(r.calories); byDay[r.eaten_on].p+=Number(r.protein); } L.push(`MEAL: goal ${r0(goal)} kcal/day${goals?`, protein ${r0(goals.protein)} g`:''}. ${Object.keys(byDay).length} of the last 14 days logged.`); for(const [d,v] of Object.entries(byDay)) add(d,`ate ${r0(v.c)} kcal (P ${r0(v.p)}g)${v.c>goal?' OVER goal':''}`); }
  if(data.write?.ok){ const e=data.write.v; L.push(`WRITE: ${e.length} journal entries in 30 days, average rating ${e.length?r1(e.reduce((a,r)=>a+r.rating,0)/e.length):'none'}.`); for(const r of e) add(r.written_on,`rated day ${r.rating}/10${r.body?.trim()?` "${r.body.trim().slice(0,140).replace(/\s+/g,' ')}${r.body.length>140?'…':''}"`:''}`); }
  if(data.read?.ok){ const b=data.read.v; L.push(`READ: reading ${b.filter(x=>x.status==='reading').map(x=>x.title).join(', ')||'nothing'}; finished ${b.filter(x=>x.status==='finished'&&(x.finished_on||'')>=since).map(x=>`${x.title} (${x.rating}/10)`).join(', ')||'nothing'} in 28 days.`); for(const x of b) if(x.finished_on) add(x.finished_on,`finished reading ${x.title}`); }
  L.push('\nDay by day, last 28 days (missing days had nothing logged anywhere):');
  for(let d=since; d<=t; d=addDays(d,1)) if(dayLine[d]) L.push(`${d}: ${dayLine[d].join('; ')}`);
  return L.join('\n');
}
window.coach={app:'you',note:'The coach reads the last few weeks from all six apps, including short journal excerpts.',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};
// Show the score in the sidebar whenever the coach card renders one.
new MutationObserver(()=>{ const s=document.querySelector('#coach .coach-score'); $('side-score').textContent=s?s.firstChild.textContent.trim():'—'; }).observe($('coach-body'),{childList:true,subtree:true});

render();
connect().catch(err=>message('history-message',err.message,'error'));
})();
