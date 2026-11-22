(function(){
'use strict';
const KEY='gymtracker.v1';
const VERSION='0.3.2';

/* ---------------- state ---------------- */
let S=null;
try{ S=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ S=null; }
if(!S||!S.exercises||!Array.isArray(S.plans)) S=window.GT_SEED();
// Migration 0.3: Feld "strava" enthält jetzt Stravas exercise_type (z. B. BARBELL_DEADLIFT)
(function(){ const seed=window.GT_SEED().exercises; let ch=false;
  Object.values(S.exercises).forEach(e=>{ const v=e.strava||''; if(!v||/^[A-Z0-9_]+$/.test(v)) return;
    e.strava=seed[e.id]&&seed[e.id].strava||v.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,''); ch=true; });
  if(ch) save();
})();
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){ toast('Speichern fehlgeschlagen'); } }
try{ navigator.storage&&navigator.storage.persist&&navigator.storage.persist(); }catch(e){}

// UI state (not persisted)
let view='home', editPlan=null, editItem=-1, sheet=null, sheetArg=null, confirmKey=null;
let up=null; // laufender Strava-Upload {id,msg,err}
const SV=window.GTStrava;

const app=document.getElementById('app');
const restEl=document.getElementById('rest');
const toastEl=document.getElementById('toast');

/* ---------------- helpers ---------------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fw=w=>Number(w).toLocaleString('de-DE',{maximumFractionDigits:2});
const mmss=sec=>{sec=Math.max(0,Math.round(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')};
const dfmt=t=>new Date(t).toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'});
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const EX=id=>S.exercises[id]||{id,name:'?',type:'weight',step:2.5,rest:60};
const A=()=>S.active;
const curItem=()=>A()&&A().ex[A().cur];

function setStr(e,s){
  if(s.s!=null) return mmss(s.s);
  if(EX(e).type==='bodyweight') return (s.w?'+'+fw(s.w)+' kg × ':'')+s.r;
  return fw(s.w)+' × '+s.r;
}
function setsLine(e,sets){
  if(!sets||!sets.length) return '–';
  const strs=sets.map(s=>setStr(e,s));
  return strs.every(x=>x===strs[0])&&strs.length>1 ? sets.length+'× '+strs[0] : strs.join(' · ');
}
function lastSets(exId,beforeStart){
  for(let i=S.history.length-1;i>=0;i--){
    const h=S.history[i]; if(beforeStart&&h.start>=beforeStart) continue;
    const e=h.ex.find(x=>x.ex===exId&&x.sets.length); if(e) return {sets:e.sets,date:h.start};
  }
  return null;
}
function planLastUsed(pid){ let t=0; S.history.forEach(h=>{ if(h.plan===pid&&h.start>t) t=h.start; }); return t; }
function activePlans(){ return S.plans.filter(p=>!p.archived); }
function nextPlan(){ return activePlans().slice().sort((a,b)=>planLastUsed(a.id)-planLastUsed(b.id))[0]||null; }
function clampCap(e,w){ const c=EX(e).cap; return (c>0&&w>c)?c:w; }

// Zielgewicht einer Plan-Übung: manuell gesetzt (it.weight) oder letzter Satz aus dem letzten Training
function targetW(it,before){
  const e=EX(it.ex); if(e.type==='time') return null;
  if(it.weight!=null&&it.weight!=='') return clampCap(it.ex,+it.weight);
  const l=lastSets(it.ex,before); const ws=l?l.sets.filter(s=>s.w!=null):[];
  return clampCap(it.ex, ws.length?ws[ws.length-1].w:(e.type==='bodyweight'?0:20));
}
function targetStr(it,before){
  const e=EX(it.ex);
  if(e.type==='time') return it.sets+' × '+mmss(it.secs||30);
  const w=targetW(it,before);
  return it.sets+' × '+(it.reps||10)+(e.type==='bodyweight'?(w?' · +'+fw(w)+' kg':' · Eigengew.'):' · '+fw(w)+' kg');
}
function suggest(it){
  const e=EX(it.ex), idx=it.done.length;
  if(e.type==='time'){
    if(it.secs) return {s:it.secs};
    const l=lastSets(it.ex); return {s:l?(l.sets[Math.min(idx,l.sets.length-1)].s||30):30};
  }
  let w, r=it.reps||0;
  const own=it.done.filter(x=>x.w!=null);
  w=own.length?own[own.length-1].w:targetW(it,A()&&A().start);
  if(!r) r=10;
  return {w:clampCap(it.ex,w),r};
}
function draft(it){ if(!it.draft) it.draft=suggest(it); return it.draft; }

/* ---------------- audio, wake lock ---------------- */
let actx=null, wake=null;
function unlockAudio(){
  try{
    if(!actx){ actx=new (window.AudioContext||window.webkitAudioContext)();
      const b=actx.createBuffer(1,1,22050), s=actx.createBufferSource(); s.buffer=b; s.connect(actx.destination); s.start(0); }
    if(actx.state!=='running') actx.resume();
  }catch(e){}
}
function beep(kind){
  if(!S.settings.sound) return;
  try{
    if(!actx) return; if(actx.state!=='running') actx.resume();
    if(S.settings.ignoreMute&&navigator.audioSession){ try{ navigator.audioSession.type='playback'; setTimeout(()=>{try{navigator.audioSession.type='auto'}catch(e){}},1600); }catch(e){} }
    // [Startzeit s, Frequenz Hz, Dauer s]
    const tones=kind==='short'?[[0,1046,.25]]:kind==='tick'?[[0,880,.13]]:kind==='go'?[[0,1320,.7]]
      :kind==='demo'?[[0,880,.13],[1,880,.13],[2,880,.13],[3,880,.13],[4,1320,.7]]:[[0,880,.25],[.3,880,.25],[.6,1320,.25]];
    const vol=S.settings.volume||0.8;
    tones.forEach(([t,f,d])=>{
      const o=actx.createOscillator(), g=actx.createGain(); o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(actx.destination);
      const s=actx.currentTime+t+.03; g.gain.setValueAtTime(.0001,s); g.gain.exponentialRampToValueAtTime(vol,s+.02); g.gain.setValueAtTime(vol,s+Math.max(.03,d-.08)); g.gain.exponentialRampToValueAtTime(.0001,s+d); o.start(s); o.stop(s+d+.02);
    });
  }catch(e){}
  try{ navigator.vibrate&&navigator.vibrate([200,100,200]); }catch(e){}
}
async function lockScreen(){
  try{ if(A()&&'wakeLock' in navigator&&!wake){ wake=await navigator.wakeLock.request('screen'); wake.addEventListener('release',()=>{wake=null;}); } }catch(e){}
}
function unlockScreen(){ try{ wake&&wake.release(); }catch(e){} wake=null; }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ lockScreen(); render(); } });

/* ---------------- toast + undo ---------------- */
let toastT=0, undoFn=null;
function toast(msg,undo){
  undoFn=undo||null;
  toastEl.innerHTML='<span>'+esc(msg)+'</span>'+(undo?'<button type="button" data-a="undo">Rückgängig</button>':'');
  toastEl.hidden=false; clearTimeout(toastT);
  toastT=setTimeout(()=>{toastEl.hidden=true;undoFn=null;},5000);
}

/* ---------------- workout logic ---------------- */
function startWorkout(plan){
  const items=plan?plan.items:[];
  S.active={plan:plan?plan.id:null,name:plan?plan.name:'Freies Training',start:Date.now(),cur:0,rest:null,clock:null,
    ex:items.map(i=>({ex:i.ex,sets:i.sets,reps:i.reps,secs:i.secs,weight:i.weight,done:[],skipped:false,draft:null}))};
  view='home'; sheet=S.active.ex.length?null:'swap'; sheetArg='add';
  save(); lockScreen(); render();
}
function itemDone(it){ return it.skipped||it.done.length>=it.sets; }
function findNext(from){
  const a=A(), n=a.ex.length;
  for(let k=1;k<=n;k++){ const i=(from+k)%n; if(!itemDone(a.ex[i])) return i; }
  return -1;
}
function nextText(i){
  const a=A(); if(i<0) return null; const it=a.ex[i]; const e=EX(it.ex);
  const d=draft(it);
  return {name:e.name, val: e.type==='time'?mmss(d.s):(e.type==='bodyweight'&&!d.w?d.r+' Wdh.':fw(d.w)+' kg × '+d.r), set:'Satz '+(it.done.length+1)+' von '+Math.max(it.sets,it.done.length+1)};
}
function logSet(value){
  const a=A(), it=curItem(); if(!it) return;
  const e=EX(it.ex);
  const rec=e.type==='time'?{s:value!=null?value:draft(it).s,t:Date.now()}:{w:draft(it).w,r:draft(it).r,t:Date.now()};
  if(e.type!=='time'&&!(rec.r>0)){ toast('Erst Wiederholungen einstellen'); return; }
  const prevCur=a.cur;
  it.done.push(rec); it.draft=null; a.clock=null;
  let nxt=a.cur;
  if(it.done.length>=it.sets){ nxt=findNext(a.cur); }
  if(nxt>=0){
    a.cur=nxt;
    const sec=e.rest||60;
    a.rest={end:Date.now()+sec*1000,total:sec*1000,beeped:false};
  } else a.rest=null;
  save(); render();
  toast((e.type==='time'?mmss(rec.s):setStr(it.ex,rec))+' gespeichert',()=>{
    it.done.pop(); it.draft=null; a.cur=prevCur; a.rest=null; if(sheet==='finish') sheet=null; save(); render();
  });
  if(nxt<0){ sheet='finish'; render(); }
}
function finishWorkout(){
  const a=A();
  const ex=a.ex.filter(i=>i.done.length).map(i=>({ex:i.ex,sets:i.done.map(s=>s.s!=null?{s:s.s,t:s.t}:{w:s.w,r:s.r,t:s.t})}));
  unlockScreen();
  if(!ex.length){ S.active=null; sheet=null; save(); render(); toast('Leeres Training verworfen'); return; }
  const w={id:uid('w'),plan:a.plan,name:a.name,start:a.start,end:Date.now(),ex,sync:'offen'};
  // manuelles Zielgewicht gilt bis zum nächsten Training dieser Übung, danach zählt das echte Gewicht
  const pl=S.plans.find(p=>p.id===a.plan); if(pl) pl.items.forEach(i=>{ if(ex.some(x=>x.ex===i.ex)) delete i.weight; });
  S.history.push(w); S.active=null; sheet='summary'; sheetArg=w.id; save(); render();
}
function stats(w){
  let sets=0,vol=0; w.ex.forEach(e=>(e.sets||e.done||[]).forEach(s=>{sets++; if(s.w) vol+=s.w*s.r;}));
  return {sets,vol,dur:Math.round(((w.end||Date.now())-w.start)/60000)};
}

/* ---------------- render ---------------- */
function render(){
  const y=document.querySelector('.scroll')?.scrollTop||0;
  if(A()) app.innerHTML=vWorkout();
  else if(view==='plans') app.innerHTML=vPlans();
  else if(view==='plan') app.innerHTML=vPlanEdit();
  else if(view==='item') app.innerHTML=vItemEdit();
  else if(view==='settings') app.innerHTML=vSettings();
  else app.innerHTML=vHome();
  if(keepScroll){ const sc=document.querySelector('.scroll'); if(sc) sc.scrollTop=y; } keepScroll=false;
  document.getElementById('sheet')?.remove();
  const sh=sheet?vSheet():'';
  if(sh){ const d=document.createElement('div'); d.id='sheet'; d.innerHTML=sh; document.body.appendChild(d); }
  tick();
}
let keepScroll=false;

function vHome(){
  const np=nextPlan(), others=activePlans().filter(p=>p!==np);
  const hist=S.history.slice().reverse().slice(0,6);
  const planLine=p=>p.items.map(i=>EX(i.ex).name).join(', ');
  const planList=p=>`<ul class="exl">${p.items.map(i=>`<li><span>${esc(EX(i.ex).name)}</span><span class="num">${esc(targetStr(i))}</span></li>`).join('')}</ul>`;
  return `
  <header class="home-h pad"><h1>Gym<span>Tracker</span></h1><button class="btn sm ghost" data-a="go" data-v="settings" aria-label="Einstellungen">⚙︎</button></header>
  <main class="scroll pad">
    ${np?`<button class="today" data-a="start" data-id="${esc(np.id)}">
      <span class="lbl">Heute dran</span><h2>${esc(np.name)}</h2>
      ${planList(np)}
      <span class="go">▶ Training starten</span></button>`:`<div class="card"><b>Kein aktiver Plan</b><p class="note">Leg unter „Pläne“ einen an.</p></div>`}
    ${others.length?`<section class="sect"><h3>Oder stattdessen</h3><div class="list">${others.map(p=>`<button class="card" data-a="start" data-id="${esc(p.id)}"><div class="row"><b>${esc(p.name)}</b><span class="muted">▶</span></div><span class="note">${esc(planLine(p))}</span></button>`).join('')}</div></section>`:''}
    <div class="links"><button class="btn" data-a="go" data-v="plans">Pläne</button><button class="btn" data-a="start-free">Ohne Plan</button></div>
    ${hist.length?`<section class="sect"><h3>Letzte Trainings</h3><div class="list">${hist.map(h=>{const st=stats(h);return `<button class="card" data-a="hist" data-id="${esc(h.id)}"><div class="row"><b>${esc(dfmt(h.start))} · ${esc(h.name||planName(h.plan))}</b><span class="muted num">${st.sets} Sätze</span></div><span class="note">${esc(h.ex.map(e=>EX(e.ex).name).join(', '))}${h.source==='strava'?' · <span class="badge">aus Strava</span>':h.stravaId?' · <span class="badge">in Strava ✓</span>':' · <span class="badge" style="color:var(--warn)">nicht hochgeladen</span>'}</span></button>`}).join('')}</div></section>`:''}
    <p class="note">Version ${VERSION} · Daten bleiben nur auf diesem Gerät.</p>
  </main>`;
}
function planName(pid){ const p=S.plans.find(x=>x.id===pid); return p?p.name:'Training'; }

function vWorkout(){
  const a=A(), it=curItem();
  const head=`<header class="bar pad">
      <button class="btn icon" data-a="sheet" data-v="exlist" aria-label="Übungsliste">☰</button>
      <div class="grow"><b>${esc(a.name)}</b><span class="clock num" id="elapsed">0:00</span></div>
      <button class="btn sm" data-a="sheet" data-v="finish">Beenden</button></header>`;
  if(!it) return head+`<main class="scroll pad"><h2>Los geht's</h2><p class="note">Füg eine Übung hinzu.</p><button class="btn primary block" data-a="sheet" data-v="swap" data-arg="add">Übung hinzufügen</button></main>`;
  const e=EX(it.ex), d=draft(it), n=Math.max(it.sets,it.done.length+1), idx=it.done.length;
  const l=lastSets(it.ex,a.start);
  let big, mainBtn;
  if(e.type==='time'){
    if(a.clock){
      big=`<div class="clockbig" id="clock">0:00</div><p class="note" style="text-align:center">Ziel ${mmss(d.s)}</p>`;
      mainBtn=`<button class="done-btn stop" data-a="clock-stop">■ Stopp</button>`;
    } else {
      big=`<div class="bigrow"><button data-step="s" data-dir="-1" aria-label="weniger Sekunden">−</button>
        <div class="bigval"><input id="v-s" class="num" value="${mmss(d.s)}" readonly aria-label="Zielzeit"><span class="u">Zielzeit</span></div>
        <button data-step="s" data-dir="1" aria-label="mehr Sekunden">+</button></div>
        <div class="minor"><button class="btn sm" data-a="log-target">✓ ${mmss(d.s)} ohne Uhr eintragen</button></div>`;
      mainBtn=`<button class="done-btn" data-a="clock-start">▶ Start</button>`;
    }
  } else {
    const capped=e.cap>0&&d.w>=e.cap;
    big=`<div class="big">
      <div class="bigrow"><button data-step="w" data-dir="-1" aria-label="Gewicht minus">−</button>
        <div class="bigval${capped?' capped':''}"><input id="v-w" class="num" inputmode="decimal" value="${fw(d.w)}" aria-label="Gewicht"><span class="u">${e.type==='bodyweight'?'kg Zusatz':'kg'}${capped?' · Obergrenze':''}</span></div>
        <button data-step="w" data-dir="1" aria-label="Gewicht plus">+</button></div>
      <div class="bigrow"><button data-step="r" data-dir="-1" aria-label="Wiederholungen minus">−</button>
        <div class="bigval"><input id="v-r" class="num" inputmode="numeric" value="${d.r}" aria-label="Wiederholungen"><span class="u">Wdh.${it.reps?' · Ziel '+it.reps:''}</span></div>
        <button data-step="r" data-dir="1" aria-label="Wiederholungen plus">+</button></div></div>`;
    mainBtn=`<button class="done-btn" data-a="log">✓ Satz erledigt</button>`;
  }
  const dots=[];
  for(let i=0;i<n;i++){
    const s=it.done[i];
    dots.push(s?`<span class="sd done"><i>✓</i>${esc(setStr(it.ex,s))}</span>`:`<span class="sd${i===idx?' next':''}"><i>${i+1}</i>${i===idx?'jetzt':''}</span>`);
  }
  return head+`
  <main class="scroll pad">
    <section class="ex-h"><h2>${esc(e.name)}</h2>
      <span class="sub">Satz <b class="num">${Math.min(idx+1,n)}</b> von <b class="num">${n}</b> · Vorgabe <b class="num">${esc(targetStr(it,a.start))}</b>${itemDone(it)&&!it.skipped?' · <span style="color:var(--good)">fertig</span>':''}${it.skipped?' · übersprungen':''}</span>
      ${e.note?`<p class="ex-note">${esc(e.note)}</p>`:''}</section>
    ${big}
    <div class="setdots">${dots.join('')}</div>
    <p class="last">${l?'Letztes Mal ('+esc(dfmt(l.date))+'): <b class="num">'+esc(setsLine(it.ex,l.sets))+'</b>':'Noch keine Vorwerte'}</p>
  </main>
  <footer class="dock pad">
    <button class="btn icon" data-a="prev" aria-label="Vorherige Übung" ${a.cur===0?'disabled':''}>‹</button>
    ${mainBtn}
    <button class="btn icon" data-a="next" aria-label="Nächste Übung" ${a.cur>=a.ex.length-1?'disabled':''}>›</button>
  </footer>`;
}

function vPlans(){
  const act=S.plans.filter(p=>!p.archived), arc=S.plans.filter(p=>p.archived);
  const card=p=>`<button class="card" data-a="edit-plan" data-id="${esc(p.id)}"><div class="row"><b>${esc(p.name)}</b><span class="muted">›</span></div><span class="note">${p.items.length} Übungen · ${esc(p.items.map(i=>EX(i.ex).name).join(', '))}</span></button>`;
  return `<header class="bar pad"><button class="btn icon" data-a="go" data-v="home" aria-label="Zurück">‹</button><div class="grow"><b>Pläne</b></div><button class="btn sm primary" data-a="new-plan">+ Neu</button></header>
  <main class="scroll pad">
    <section class="sect"><h3>Aktiv · im Wechsel</h3><div class="list">${act.map(card).join('')||'<p class="note">Keiner.</p>'}</div>
    ${act.length>2?'<p class="note">Mehr als zwei aktive Pläne gehen auch, die App schlägt immer den vor, der am längsten her ist.</p>':''}</section>
    <section class="sect"><h3>Archiv</h3><div class="list">${arc.map(card).join('')||'<p class="note">Leer. Pläne, die du gerade nicht machst, kannst du hier parken.</p>'}</div></section>
  </main>`;
}
function vPlanEdit(){
  const p=S.plans.find(x=>x.id===editPlan); if(!p){ view='plans'; return vPlans(); }
  return `<header class="bar pad"><button class="btn icon" data-a="go" data-v="plans" aria-label="Zurück">‹</button><div class="grow"><b>Plan bearbeiten</b></div></header>
  <main class="scroll pad">
    <label class="field"><span>Name</span><input class="inp" data-f="plan.name" value="${esc(p.name)}"></label>
    <section class="sect"><h3>Übungen</h3><div class="list">
    ${p.items.map((i,k)=>{const e=EX(i.ex);return `<div class="item"><button style="text-align:left" data-a="edit-item" data-i="${k}"><b>${esc(e.name)}</b><div class="meta">${esc(targetStr(i))}${i.weight!=null&&e.type!=='time'?' (fest)':''} · Pause ${mmss(e.rest)}${e.cap?' · max '+fw(e.cap)+' kg':''} ›</div></button>
      <div class="ord"><button class="btn" data-a="mv" data-i="${k}" data-d="-1" aria-label="nach oben" ${k===0?'disabled':''}>↑</button><button class="btn" data-a="mv" data-i="${k}" data-d="1" aria-label="nach unten" ${k===p.items.length-1?'disabled':''}>↓</button></div></div>`}).join('')}
    </div><button class="btn block" data-a="sheet" data-v="swap" data-arg="plan">+ Übung hinzufügen</button></section>
    <div class="grid2">
      <button class="btn" data-a="archive">${p.archived?'Aus Archiv holen':'Archivieren'}</button>
      <button class="btn ${confirmKey==='delplan'?'danger':'ghost'}" data-a="del-plan">${confirmKey==='delplan'?'Wirklich löschen?':'Plan löschen'}</button>
    </div>
  </main>`;
}
function vItemEdit(){
  const p=S.plans.find(x=>x.id===editPlan), i=p&&p.items[editItem]; if(!i){ view='plan'; return vPlanEdit(); }
  const e=EX(i.ex);
  const seg=(f,cur,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button class="${String(cur)===String(v)?'on':''}" data-a="seg" data-f="${f}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<header class="bar pad"><button class="btn icon" data-a="go" data-v="plan" aria-label="Zurück">‹</button><div class="grow"><b>${esc(e.name)}</b><span class="note">${esc(p.name)}</span></div></header>
  <main class="scroll pad">
    <label class="field"><span>Name der Übung</span><input class="inp" data-f="ex.name" value="${esc(e.name)}"></label>
    <div class="field"><span>Typ</span>${seg('ex.type',e.type,[['weight','Gewicht'],['bodyweight','Eigengewicht'],['time','Zeit']])}</div>
    <div class="grid2">
      <label class="field"><span>Sätze</span><input class="inp num" inputmode="numeric" data-f="item.sets" value="${i.sets}"></label>
      ${e.type==='time'?`<label class="field"><span>Sekunden</span><input class="inp num" inputmode="numeric" data-f="item.secs" value="${i.secs}"></label>`
        :`<label class="field"><span>Ziel-Wdh.</span><input class="inp num" inputmode="numeric" data-f="item.reps" value="${i.reps}"></label>`}
    </div>
    ${e.type!=='time'?`<label class="field"><span>Zielgewicht kg${e.type==='bodyweight'?' (Zusatz)':''}</span><input class="inp num" inputmode="decimal" data-f="item.weight" value="${i.weight!=null?fw(i.weight):''}" placeholder="vom letzten Training: ${fw(targetW({...i,weight:null}))}"></label>
    <p class="note">Leer lassen = Gewicht aus deinem letzten Training. Ein fester Wert gilt bis zum nächsten Training dieser Übung.</p>`:''}
    <div class="field"><span>Pause nach jedem Satz</span>${seg('ex.rest',e.rest,[[30,'0:30'],[45,'0:45'],[60,'1:00'],[90,'1:30'],[120,'2:00']])}</div>
    ${e.type!=='time'?`<div class="field"><span>Gewichtsschritt</span>${seg('ex.step',e.step,[[1,'1 kg'],[2.5,'2,5 kg'],[5,'5 kg']])}</div>
    <label class="field"><span>Obergrenze kg (leer = keine)</span><input class="inp num" inputmode="decimal" data-f="ex.cap" value="${e.cap?fw(e.cap):''}" placeholder="z. B. 50"></label>`:''}
    <label class="field"><span>Hinweis im Training</span><input class="inp" data-f="ex.note" value="${esc(e.note||'')}" placeholder="optional"></label>
    <label class="field"><span>Strava-Übung (exercise_type)</span><input class="inp" data-f="ex.strava" list="stypes" autocapitalize="characters" autocomplete="off" value="${esc(e.strava||'')}" placeholder="z. B. LAT_PULLDOWN"></label>
    <datalist id="stypes">${SV.TYPES.map(t=>`<option value="${t}">`).join('')}</datalist>
    <p class="note">Leer = Übung landet in Strava nur als Text in der Beschreibung.</p>
    <p class="note">Name, Typ, Pause, Schritt und Obergrenze gelten für die Übung in allen Plänen. Sätze und Ziel nur für diesen Plan.</p>
    <button class="btn ${confirmKey==='delitem'?'danger':'ghost'} block" data-a="del-item">${confirmKey==='delitem'?'Wirklich aus dem Plan nehmen?':'Aus diesem Plan entfernen'}</button>
  </main>`;
}
function vUpload(w){
  if(w.stravaId) return `<a class="btn good block" href="https://www.strava.com/activities/${esc(w.stravaId)}" target="_blank" rel="noopener" style="text-decoration:none">✓ In Strava ansehen</a>${w.stravaMissing&&w.stravaMissing.length?`<p class="note">Nur in der Beschreibung (ohne Strava-Übung): ${esc(w.stravaMissing.join(', '))}</p>`:''}`;
  if(up&&up.id===w.id&&!up.err) return `<button class="btn block" disabled>${esc(up.msg)}</button>`;
  const err=up&&up.id===w.id&&up.err?`<p class="note" style="color:var(--bad)">${esc(up.err)}</p>`:'';
  if(!SV.connected()) return err+`<button class="btn ghost block" data-a="go-strava">Strava verbinden, dann hochladen</button>`;
  const b=SV.build(w,EX);
  return err+`<button class="btn primary block" data-a="upload" data-id="${esc(w.id)}">⇪ Nach Strava hochladen</button>${b.missing.length?`<p class="note">Ohne Strava-Übung, landen nur in der Beschreibung: ${esc(b.missing.join(', '))}</p>`:''}`;
}
async function doUpload(id){
  const w=S.history.find(h=>h.id===id); if(!w||(up&&up.id===id&&!up.err)) return;
  up={id,msg:'Verbinde mit Strava …'}; render();
  try{
    const r=await SV.upload(w,EX,m=>{ up.msg=m; render(); });
    if(r.pending){ up={id,err:'Strava braucht länger als sonst. Schau gleich in Strava nach, bevor du nochmal hochlädst.'}; }
    else{ w.stravaId=r.activityId; w.stravaMissing=r.missing; w.sync='ok'; up=null; save(); toast(r.duplicate?'War schon in Strava':'In Strava ✓'); }
  }catch(e){ up={id,err:e.message||'Upload fehlgeschlagen'}; }
  render();
}
async function doExchange(code,scope){
  try{ await SV.exchange(code,scope); toast('Strava verbunden ✓'); }
  catch(e){ toast(e.message||'Verbinden fehlgeschlagen'); }
  view='settings'; sheet=null; render();
}
function vSettings(){
  const dl=S.exercises.dl;
  return `<header class="bar pad"><button class="btn icon" data-a="go" data-v="home" aria-label="Zurück">‹</button><div class="grow"><b>Einstellungen</b></div></header>
  <main class="scroll pad">
    <section class="sect"><h3>Pausenton</h3>
      <div class="toggle"><span>Ton am Pausenende</span><div class="seg" style="width:160px"><button class="${S.settings.sound?'on':''}" data-a="set" data-f="sound" data-v="1">An</button><button class="${!S.settings.sound?'on':''}" data-a="set" data-f="sound" data-v="0">Aus</button></div></div>
      <div class="toggle"><span>Auch im Stumm-Modus<br><span class="note">kann Musik kurz unterbrechen</span></span><div class="seg" style="width:160px"><button class="${S.settings.ignoreMute?'on':''}" data-a="set" data-f="ignoreMute" data-v="1">An</button><button class="${!S.settings.ignoreMute?'on':''}" data-a="set" data-f="ignoreMute" data-v="0">Aus</button></div></div>
      <div class="field"><span>Lautstärke</span><div class="seg">${[[0.3,'leise'],[0.6,'mittel'],[0.8,'laut'],[1,'max']].map(([v,l])=>`<button class="${S.settings.volume==v?'on':''}" data-a="set" data-f="volume" data-v="${v}">${l}</button>`).join('')}</div></div>
      <button class="btn block" data-a="test-sound">🔊 Pausenende testen (4 Beeps + Start)</button>
    </section>
    ${dl?`<section class="sect"><h3>Kreuzheben · LWS</h3>
      <label class="field"><span>Obergrenze kg</span><input class="inp num" inputmode="decimal" data-f="dlcap" value="${dl.cap?fw(dl.cap):''}"></label>
      <p class="note">Die App schlägt nie mehr vor und lässt beim Kreuzheben nicht höher stellen.</p></section>`:''}
    ${vStravaSettings()}
    <section class="sect"><h3>Sicherung</h3>
      <p class="note">Safari kann Daten löschen, wenn die App lange nicht benutzt wird. Ab und zu sichern schadet nicht.</p>
      <div class="grid2"><button class="btn" data-a="export">Sichern (Datei)</button><label class="btn" style="cursor:pointer">Wiederherstellen<input type="file" accept="application/json,.json" id="importFile" hidden></label></div>
    </section>
    <section class="sect"><h3>Zurücksetzen</h3>
      <button class="btn ${confirmKey==='reset'?'danger':'ghost'} block" data-a="reset">${confirmKey==='reset'?'Wirklich? Alles weg, Startdaten zurück':'Alles auf Startdaten zurücksetzen'}</button></section>
    <p class="note">GymTracker ${VERSION}. Strava-Upload, Puls und Workout-Generator kommen in den nächsten Ausbaustufen.</p>
  </main>`;
}

function vStravaSettings(){
  const c=SV.cfg();
  const status=SV.connected()?`<div class="card"><b>✓ Verbunden${c.athlete&&c.athlete.name?' als '+esc(c.athlete.name):''}</b><span class="note">Nach jedem Training kannst du es mit einem Tipp hochladen.</span></div>`
    :`<p class="note">Einmalig: Client-ID und Client-Secret aus <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener" style="color:var(--accent)">strava.com/settings/api</a> hier eintragen. Sie bleiben nur auf diesem iPhone.</p>`;
  return `<section class="sect" id="strava"><h3>Strava</h3>${status}
    <form id="stravaForm" class="list">
      <label class="field"><span>Client-ID</span><input class="inp num" id="sid" inputmode="numeric" autocomplete="off" value="${esc(c.clientId||'')}"></label>
      <label class="field"><span>Client-Secret</span><input class="inp" id="ssec" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${c.clientSecret?'gespeichert ✓ (leer lassen = behalten)':'aus Strava kopieren'}"></label>
      <button class="btn block" type="submit">Speichern</button>
    </form>
    <button class="btn primary block" data-a="strava-connect" ${SV.hasCreds()?'':'disabled'}>${SV.connected()?'Neu verbinden':'Mit Strava verbinden'}</button>
    <details><summary class="note" style="min-height:44px;display:flex;align-items:center">Code von Hand einfügen</summary>
      <form id="codeForm" class="grid2" style="grid-template-columns:1fr auto"><input class="inp" id="scode" autocomplete="off" autocapitalize="off" placeholder="Code aus dem Strava-Fenster"><button class="btn" type="submit">OK</button></form></details>
    ${SV.connected()||SV.hasCreds()?`<button class="btn ghost block" data-a="strava-forget">${confirmKey==='sforget'?'Wirklich? Zugangsdaten löschen':'Strava trennen und Zugangsdaten löschen'}</button>`:''}
    <p class="note">In der Strava-API-App muss als „Authorization Callback Domain“ <b>${esc(location.hostname)}</b> stehen.</p>
  </section>`;
}
function vSheet(){
  const a=A();
  const wrap=(title,body,label)=>`<div class="backdrop" data-a="close-bg"><div class="sheet pad" role="dialog" aria-label="${esc(label||title)}"><div class="sheet-h"><h2>${esc(title)}</h2><button class="btn icon" data-a="close" aria-label="Schließen">✕</button></div>${body}</div></div>`;
  if(sheet==='code'){
    return wrap('Fast geschafft',`<p>Strava hat dich zurückgeschickt, aber in diesem Fenster kennt die App deine Zugangsdaten nicht (der Home-Bildschirm hat seinen eigenen Speicher).</p>
      <ol class="note" style="padding-left:20px;margin:0;display:flex;flex-direction:column;gap:6px"><li>Code kopieren</li><li>GymTracker vom Home-Bildschirm öffnen</li><li>⚙︎ → Strava → „Code von Hand einfügen“</li></ol>
      <input class="inp num" id="codeOut" readonly value="${esc(sheetArg)}" style="font-size:15px">
      <button class="btn primary block" data-a="copy-code">Code kopieren</button>`);
  }
  if(sheet==='exlist'&&a){
    const it=curItem();
    return wrap('Übungen',`<div class="list">${a.ex.map((x,i)=>{const e=EX(x.ex);return `<button class="pick${i===a.cur?' on':''}${itemDone(x)&&!x.skipped?' okd':''}" data-a="goto" data-i="${i}"><span><b>${esc(e.name)}</b><br><span class="note num">${esc(targetStr(x,a.start))}</span></span><span class="r num">${x.skipped?'übersprungen':x.done.length+'/'+x.sets+(itemDone(x)?' ✓':'')}</span></button>`}).join('')}</div>
      ${it?`<h3 class="lbl">Aktuelle Übung: ${esc(EX(it.ex).name)}</h3>
      <div class="grid3"><button class="btn sm" data-a="add-set">+ Satz</button><button class="btn sm" data-a="skip">Überspringen</button><button class="btn sm" data-a="sheet" data-v="swap" data-arg="swap">Tauschen</button></div>`:''}
      <button class="btn block" data-a="sheet" data-v="swap" data-arg="add">+ Übung hinzufügen</button>`);
  }
  if(sheet==='swap'){
    const mode=sheetArg; // swap | add | plan
    const used=new Set(mode==='plan'?(S.plans.find(p=>p.id===editPlan)?.items||[]).map(i=>i.ex):(a?a.ex.map(x=>x.ex):[]));
    const lib=Object.values(S.exercises).filter(e=>!used.has(e.id)).sort((x,y)=>x.name.localeCompare(y.name,'de'));
    const title=mode==='swap'?'Übung tauschen':'Übung hinzufügen';
    return wrap(title,`<form id="newExForm" class="grid2" style="grid-template-columns:1fr auto"><input class="inp" id="newExName" placeholder="Neue Übung, z. B. Latzug" autocomplete="off" aria-label="Neue Übung"><button class="btn primary" type="submit">OK</button></form>
      <div class="list">${lib.map(e=>`<button class="pick" data-a="pick-ex" data-id="${esc(e.id)}"><b>${esc(e.name)}</b><span class="r">${e.type==='time'?'Zeit':e.type==='bodyweight'?'Eigengew.':''}</span></button>`).join('')}</div>`);
  }
  if(sheet==='finish'&&a){
    const st=stats({start:a.start,ex:a.ex.map(x=>({sets:x.done}))});
    const open=a.ex.reduce((n,x)=>n+(x.skipped?0:Math.max(0,x.sets-x.done.length)),0);
    return wrap(open?'Training beenden?':'Alles erledigt 💪',`<div class="stats"><div class="stat"><span class="lbl">Dauer</span><span class="num">${st.dur}′</span></div><div class="stat"><span class="lbl">Sätze</span><span class="num">${st.sets}</span></div><div class="stat"><span class="lbl">kg bewegt</span><span class="num">${fw(Math.round(st.vol))}</span></div></div>
      ${open?`<p class="note">${open} geplante Sätze sind noch offen, die werden nicht gespeichert.</p>`:''}
      <button class="btn good block" data-a="finish">Speichern &amp; beenden</button>
      <button class="btn block" data-a="close">Weiter trainieren</button>
      <button class="btn ${confirmKey==='discard'?'danger':'ghost'} block" data-a="discard">${confirmKey==='discard'?'Wirklich verwerfen?':'Training verwerfen'}</button>`);
  }
  if(sheet==='summary'||sheet==='hist'){
    const w=S.history.find(h=>h.id===sheetArg); if(!w) return '';
    const st=stats(w);
    return wrap(sheet==='summary'?'Stark. Gespeichert.':dfmt(w.start)+' · '+(w.name||planName(w.plan)),`<div class="stats"><div class="stat"><span class="lbl">Dauer</span><span class="num">${st.dur}′</span></div><div class="stat"><span class="lbl">Sätze</span><span class="num">${st.sets}</span></div><div class="stat"><span class="lbl">kg bewegt</span><span class="num">${fw(Math.round(st.vol))}</span></div></div>
      <ul class="exl">${w.ex.map(e=>`<li><span>${esc(EX(e.ex).name)}</span><span>${esc(setsLine(e.ex,e.sets))}</span></li>`).join('')}</ul>
      ${w.source==='strava'?'<p class="note">Aus deiner Strava-Historie übernommen.</p>':vUpload(w)}
      ${sheet==='hist'?`<button class="btn ${confirmKey==='delhist'?'danger':'ghost'} block" data-a="del-hist">${confirmKey==='delhist'?'Wirklich löschen?':'Training löschen'}</button>`:''}
      <button class="btn primary block" data-a="close">Fertig</button>`);
  }
  return '';
}

/* ---------------- ticking: clock, rest overlay ---------------- */
function tick(){
  const a=A();
  if(!a){ restEl.hidden=true; return; }
  const now=Date.now();
  const el=document.getElementById('elapsed'); if(el) el.textContent=mmss((now-a.start)/1000);
  if(a.clock){
    const c=document.getElementById('clock'); const it=curItem(); const sec=(now-a.clock.start)/1000; const tgt=it?draft(it).s:0;
    if(c){ c.textContent=mmss(Math.floor(sec)); c.classList.toggle('hit',sec>=tgt); }
    if(sec>=tgt&&!a.clock.beeped){ a.clock.beeped=true; beep('short'); }
  }
  if(a.rest){
    const left=(a.rest.end-now)/1000;
    // Countdown: 4 kurze Beeps im Sekundentakt, dann der Startton
    if(left>0&&left<=4){ const sec=Math.ceil(left); if(a.rest.cd!==sec){ a.rest.cd=sec; beep('tick'); } }
    if(left<=0&&!a.rest.beeped){ a.rest.beeped=true; save(); if(left>-10) beep('go'); }
    if(left<-20){ a.rest=null; save(); restEl.hidden=true; return; }
    const nt=nextText(a.cur);
    if(restEl.hidden||restEl.dataset.k!==String(a.rest.end)+(left<=0)){
      restEl.dataset.k=String(a.rest.end)+(left<=0);
      restEl.innerHTML=`<div class="in pad"><span class="lbl" id="restLbl">${left>0?'Pause':'Pause vorbei'}</span><div class="t" id="restT">0:00</div><div class="bar2"><div id="restBar"></div></div>
        ${nt?`<div class="nx">${left>0?'Als Nächstes':'Los geht’s'} · ${esc(nt.set)}<b>${esc(nt.name)}</b><b class="num">${esc(nt.val)}</b></div>`:''}</div>
        <div class="acts pad"><button class="btn" data-a="rest-add" data-v="-15">−15 s</button><button class="btn" data-a="rest-add" data-v="30">+30 s</button><button class="btn primary" data-a="rest-skip">Weiter</button></div>`;
    }
    restEl.hidden=false; restEl.classList.toggle('over',left<=0);
    const t=document.getElementById('restT'); if(t) t.textContent=left>0?mmss(Math.ceil(left)):'Los!';
    const b=document.getElementById('restBar'); if(b) b.style.width=Math.min(100,100*(1-left*1000/a.rest.total))+'%';
  } else restEl.hidden=true;
}
setInterval(tick,250);

/* ---------------- events ---------------- */
function readInputs(){
  const it=curItem(); if(!it||!it.draft) return;
  const wi=document.getElementById('v-w'), ri=document.getElementById('v-r');
  if(wi){ const w=parseFloat(String(wi.value).replace(',','.')); if(isFinite(w)&&w>=0) it.draft.w=clampCap(it.ex,Math.round(w*100)/100); }
  if(ri){ const r=parseInt(ri.value,10); if(isFinite(r)&&r>=0) it.draft.r=r; }
}
function step(k,dir){
  const it=curItem(); if(!it) return; const e=EX(it.ex); const d=draft(it); readInputs();
  if(k==='w'){ const nw=Math.max(0,Math.round((d.w+dir*(e.step||2.5))*100)/100); const c=clampCap(it.ex,nw); if(c<nw&&dir>0) toast('Obergrenze '+fw(e.cap)+' kg erreicht'); d.w=c; }
  if(k==='r') d.r=Math.max(0,d.r+dir);
  if(k==='s') d.s=Math.max(5,d.s+dir*(e.step||5));
  const wi=document.getElementById('v-w'), ri=document.getElementById('v-r'), si=document.getElementById('v-s');
  if(wi) wi.value=fw(d.w); if(ri) ri.value=d.r; if(si) si.value=mmss(d.s);
}

document.addEventListener('click',ev=>{
  unlockAudio();
  const b=ev.target.closest('[data-a]'); if(!b) return;
  const act=b.dataset.a, a=A();
  if(act==='close-bg'&&ev.target!==b) return;
  if(!['del-plan','del-item','reset','discard','del-hist','strava-forget'].includes(act)) confirmKey=null;
  switch(act){
    case 'undo': if(undoFn){ undoFn(); undoFn=null; } toastEl.hidden=true; break;
    case 'go': view=b.dataset.v; render(); break;
    case 'start': startWorkout(S.plans.find(p=>p.id===b.dataset.id)); break;
    case 'start-free': startWorkout(null); break;
    case 'hist': sheet='hist'; sheetArg=b.dataset.id; render(); break;
    case 'sheet': readInputs(); sheet=b.dataset.v; sheetArg=b.dataset.arg||null; render(); break;
    case 'close': case 'close-bg': sheet=null; render(); break;
    case 'prev': readInputs(); a.cur=Math.max(0,a.cur-1); a.clock=null; save(); render(); break;
    case 'next': readInputs(); a.cur=Math.min(a.ex.length-1,a.cur+1); a.clock=null; save(); render(); break;
    case 'goto': readInputs(); a.cur=+b.dataset.i; a.clock=null; sheet=null; save(); render(); break;
    case 'log': readInputs(); logSet(); break;
    case 'log-target': logSet(); break;
    case 'clock-start': a.clock={start:Date.now(),beeped:false}; save(); render(); break;
    case 'clock-stop': { const sec=Math.round((Date.now()-a.clock.start)/1000); logSet(Math.max(1,sec)); break; }
    case 'add-set': { const it=curItem(); it.sets++; it.skipped=false; sheet=null; save(); render(); toast('Satz angehängt'); break; }
    case 'skip': { const it=curItem(), from=a.cur; it.skipped=true; const n=findNext(a.cur); if(n>=0) a.cur=n; sheet=null; save(); render();
      toast('Übersprungen',()=>{ it.skipped=false; a.cur=from; save(); render(); }); if(n<0){ sheet='finish'; render(); } break; }
    case 'pick-ex': pickExercise(b.dataset.id); break;
    case 'rest-add': a.rest.end=Math.max(Date.now()+1000,a.rest.end+ +b.dataset.v*1000); a.rest.total=Math.max(a.rest.total,a.rest.end-Date.now()); a.rest.beeped=false; a.rest.cd=null; restEl.dataset.k=''; save(); tick(); break;
    case 'rest-skip': a.rest=null; save(); render(); break;
    case 'finish': finishWorkout(); break;
    case 'discard': if(confirmKey!=='discard'){ confirmKey='discard'; render(); } else { confirmKey=null; S.active=null; sheet=null; unlockScreen(); save(); render(); toast('Training verworfen'); } break;
    case 'del-hist': if(confirmKey!=='delhist'){ confirmKey='delhist'; render(); } else { confirmKey=null; S.history=S.history.filter(h=>h.id!==sheetArg); sheet=null; save(); render(); toast('Training gelöscht'); } break;
    // plans
    case 'new-plan': { const p={id:uid('p'),name:'Neuer Plan',archived:false,items:[]}; S.plans.push(p); editPlan=p.id; view='plan'; save(); render(); break; }
    case 'edit-plan': editPlan=b.dataset.id; view='plan'; render(); break;
    case 'edit-item': editItem=+b.dataset.i; view='item'; render(); break;
    case 'mv': { const p=S.plans.find(x=>x.id===editPlan), i=+b.dataset.i, j=i+ +b.dataset.d; [p.items[i],p.items[j]]=[p.items[j],p.items[i]]; keepScroll=true; save(); render(); break; }
    case 'archive': { const p=S.plans.find(x=>x.id===editPlan); p.archived=!p.archived; save(); render(); toast(p.archived?'Archiviert':'Wieder aktiv'); break; }
    case 'del-plan': if(confirmKey!=='delplan'){ confirmKey='delplan'; render(); } else { confirmKey=null; S.plans=S.plans.filter(x=>x.id!==editPlan); view='plans'; save(); render(); toast('Plan gelöscht'); } break;
    case 'del-item': if(confirmKey!=='delitem'){ confirmKey='delitem'; render(); } else { confirmKey=null; const p=S.plans.find(x=>x.id===editPlan); p.items.splice(editItem,1); view='plan'; save(); render(); } break;
    case 'seg': setField(b.dataset.f,b.dataset.v); keepScroll=true; render(); break;
    // settings
    case 'set': { const f=b.dataset.f, v=b.dataset.v; S.settings[f]=f==='volume'?+v:v==='1'; save(); keepScroll=true; render(); break; }
    case 'test-sound': unlockAudio(); setTimeout(()=>beep('demo'),50); break;
    case 'export': exportData(); break;
    case 'upload': doUpload(b.dataset.id); break;
    case 'go-strava': sheet=null; view='settings'; render(); document.getElementById('strava')?.scrollIntoView(); break;
    case 'strava-connect': location.href=SV.authUrl(); break;
    case 'strava-forget': if(confirmKey!=='sforget'){ confirmKey='sforget'; keepScroll=true; render(); } else { confirmKey=null; SV.forget(); keepScroll=true; render(); toast('Strava getrennt'); } break;
    case 'copy-code': { const i=document.getElementById('codeOut'); try{ navigator.clipboard.writeText(i.value).then(()=>toast('Kopiert'),()=>{ i.select(); toast('Markiert, bitte kopieren'); }); }catch(e){ i.select(); } break; }
    case 'reset': if(confirmKey!=='reset'){ confirmKey='reset'; render(); } else { confirmKey=null; S=window.GT_SEED(); view='home'; save(); render(); toast('Zurückgesetzt'); } break;
  }
});

function pickExercise(id){
  const a=A();
  if(sheetArg==='plan'){
    const p=S.plans.find(x=>x.id===editPlan); const e=EX(id);
    p.items.push({ex:id,sets:e.type==='time'?3:3,reps:e.type==='time'?0:10,secs:e.type==='time'?45:0});
    sheet=null; save(); render(); return;
  }
  if(!a) return;
  if(sheetArg==='swap'){
    const it=curItem(); it.ex=id; it.done=[]; it.draft=null; it.skipped=false;
    if(EX(id).type==='time'&&!it.secs) it.secs=45; if(EX(id).type!=='time'&&!it.reps) it.reps=10;
  } else {
    const e=EX(id); a.ex.push({ex:id,sets:3,reps:e.type==='time'?0:10,secs:e.type==='time'?45:0,done:[],skipped:false,draft:null}); a.cur=a.ex.length-1;
  }
  a.clock=null; sheet=null; save(); render();
}
document.addEventListener('submit',ev=>{
  if(ev.target.id==='stravaForm'){ ev.preventDefault(); const id=document.getElementById('sid').value.trim(), sec=document.getElementById('ssec').value.trim();
    if(!/^\d+$/.test(id)){ toast('Client-ID ist eine Zahl'); return; } SV.setCreds(id,sec); keepScroll=true; render(); toast(SV.hasCreds()?'Gespeichert. Jetzt verbinden.':'Secret fehlt noch'); return; }
  if(ev.target.id==='codeForm'){ ev.preventDefault(); let c=document.getElementById('scode').value.trim(); const m=c.match(/code=([^&\s]+)/); if(m) c=m[1]; if(c) doExchange(c,null); return; }
  if(ev.target.id!=='newExForm') return; ev.preventDefault();
  const name=document.getElementById('newExName').value.trim(); if(!name) return;
  let e=Object.values(S.exercises).find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!e){ e={id:uid('x'),name,type:'weight',strava:'',step:2.5,rest:60}; S.exercises[e.id]=e; }
  pickExercise(e.id);
});

function setField(f,v){
  const p=S.plans.find(x=>x.id===editPlan); const it=p&&p.items[editItem];
  const [o,k]=f.split('.');
  if(o==='plan'&&p){ p.name=v.trim()||p.name; }
  else if(f==='item.weight'&&it){ const w=parseFloat(String(v).replace(',','.')); if(String(v).trim()===''||!isFinite(w)) delete it.weight; else it.weight=clampCap(it.ex,Math.max(0,Math.round(w*100)/100)); }
  else if(o==='item'&&it){ const n=parseInt(v,10); if(isFinite(n)&&n>=0) it[k]=k==='sets'?Math.max(1,n):n; }
  else if(o==='ex'&&it){
    const e=EX(it.ex);
    if(k==='name') e.name=v.trim()||e.name;
    else if(k==='type'){ e.type=v; if(v==='time'&&!it.secs) it.secs=45; if(v!=='time'&&!it.reps) it.reps=10; }
    else if(k==='rest'||k==='step') e[k]=+v;
    else if(k==='cap'){ const c=parseFloat(String(v).replace(',','.')); e.cap=isFinite(c)&&c>0?c:0; }
    else if(k==='strava') e.strava=v.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    else e[k]=v.trim();
  }
  else if(f==='dlcap'&&S.exercises.dl){ const c=parseFloat(String(v).replace(',','.')); S.exercises.dl.cap=isFinite(c)&&c>0?c:0; toast(S.exercises.dl.cap?'Obergrenze '+fw(S.exercises.dl.cap)+' kg':'Keine Obergrenze'); }
  save();
}
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t.dataset&&t.dataset.f){ setField(t.dataset.f,t.value); keepScroll=true; render(); return; }
  if(t.id==='v-w'||t.id==='v-r'){ readInputs(); save(); const it=curItem(); if(it&&t.id==='v-w') t.value=fw(it.draft.w); }
  if(t.id==='importFile'&&t.files[0]) importData(t.files[0]);
});
document.addEventListener('focusin',ev=>{ if(ev.target.id==='v-w'||ev.target.id==='v-r') setTimeout(()=>ev.target.select(),0); });

// steppers: press & hold repeats
let holdT=0, holdI=0;
function stopHold(){ if(holdT||holdI){ clearTimeout(holdT); clearInterval(holdI); holdT=holdI=0; save(); } }
document.addEventListener('pointerdown',ev=>{
  const b=ev.target.closest('[data-step]'); if(!b) return;
  ev.preventDefault(); unlockAudio(); stopHold();
  const k=b.dataset.step, d=+b.dataset.dir; step(k,d);
  holdT=setTimeout(()=>{ holdI=setInterval(()=>step(k,d),120); },450);
});
['pointerup','pointercancel','pointerleave'].forEach(t=>document.addEventListener(t,stopHold));

/* ---------------- backup ---------------- */
function exportData(){
  const blob=new Blob([JSON.stringify(S,null,1)],{type:'application/json'});
  const url=URL.createObjectURL(blob), l=document.createElement('a');
  l.href=url; l.download='gymtracker-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(l); l.click(); l.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function importData(file){
  const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.exercises||!Array.isArray(d.plans)||!Array.isArray(d.history)) throw 0; S=d; save(); view='home'; render(); toast('Wiederhergestellt'); }catch(e){ toast('Datei passt nicht'); } };
  r.readAsText(file);
}

/* ---------------- boot ---------------- */
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
render(); lockScreen();
(function(){ const cb=SV.readCallback(); if(!cb) return;
  if(cb.error){ view='settings'; render(); toast('Strava: Zugriff nicht erlaubt'); return; }
  if(SV.hasCreds()){ const st=SV.cfg().state; if(st&&cb.state&&st!==cb.state){ toast('Strava-Antwort passt nicht, bitte nochmal verbinden'); return; } doExchange(cb.code,cb.scope); }
  else { sheet='code'; sheetArg=cb.code; render(); }
})();
})();
