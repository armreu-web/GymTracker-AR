// Workout-Generator (Phase 2): regelbasiert, offline, ohne KI.
// Katalog mit Tags -> Schwerpunkt-Rezept aus Slots -> gewichtete Zufallsauswahl.
// Regeln (mit Armin festgelegt am 22.11.2026):
// - 4 Schwerpunkte, vorgeschlagen wird der, der am längsten her ist (feste Pläne zählen als Ganzkörper)
// - jedes Workout endet mit 2 Rumpfübungen, Rücken- und Beintag haben je 1 Drück-Slot
// - bis zu 3 neue Übungen pro Workout, jeweils mit kurzem Erklärtext
// - nie Übungen mit hoher Last auf dem unteren Rücken; Ausnahme Kreuzheben mit Obergrenze,
//   Steigerung dort höchstens +2,5 kg und nur, wenn alle Ziel-Wdh. geschafft wurden
window.GTGen=(function(){
'use strict';

// Ausrüstung, die man in den Einstellungen ausschließen kann
const EQUIP={barbell:'Langhantel',dumbbell:'Kurzhanteln',cable:'Kabelzug',machine:'Maschinen',smith:'Multipresse',bar:'Klimmzugstange'};

// pats: Bewegungsmuster  | eq: Ausrüstung | lws: Last unterer Rücken (low/mid/high)
// w0: Startgewicht für neue Übungen (bewusst leicht) | how: Kurzanleitung für neue Übungen
// strava: exercise_type aus Stravas Upload-Katalog
const C=(id,name,type,strava,o)=>Object.assign({id,name,type,strava,step:type==='time'?5:2.5,rest:60,sets:3,reps:10,secs:0,w0:0,lws:'low',eq:[]},o);
const CAT={};
[
  // ---- schon aus deinen Trainings bekannt (gleiche IDs wie in den Startdaten) ----
  C('dl','Kreuzheben (Langhantel)','weight','BARBELL_DEADLIFT',{pats:['hinge'],eq:['barbell'],lws:'high',lwsOk:true,rest:90,cap:50,note:'LWS: Obergrenze beachten, nur sauber steigern.'}),
  C('incl','Schrägbankdrücken KH','weight','INCLINE_DUMBBELL_BENCH_PRESS',{pats:['press_h'],eq:['dumbbell'],w0:12.5}),
  C('lunge','Ausfallschritt rückwärts KH','weight','DUMBBELL_REVERSE_LUNGE',{pats:['single','balance'],eq:['dumbbell'],reps:20,w0:8,note:'Wdh. = beide Beine zusammen.'}),
  C('row','Rudern brustgestützt','weight','CHEST_SUPPORTED_ROW',{pats:['hpull'],eq:['dumbbell'],w0:15}),
  C('negpu','Negativ-Klimmzüge','bodyweight','NEGATIVE_PULL_UP',{pats:['vpull'],eq:['bar'],reps:6}),
  C('face','Face Pull','weight','FACE_PULL',{pats:['scap'],eq:['cable'],step:1,w0:10}),
  C('deadbug','Deadbug','weight','DEADBUG',{pats:['antiext'],reps:20,rest:45}),
  C('plank','Seitstütz','time','SIDE_PLANK',{pats:['lat'],secs:40,rest:30,sets:4,note:'Abwechselnd links und rechts.'}),
  C('legpress','Beinpresse','weight','MACHINE_LEG_PRESS',{pats:['knee'],eq:['machine'],step:1,reps:15,w0:50}),
  C('calf','Wadenheben stehend','weight','STANDING_CALF_RAISE',{pats:['calf'],eq:['machine'],reps:15,rest:45,w0:10}),
  C('latraise','Seitheben KH','weight','LATERAL_RAISE_GENERIC',{pats:['raise'],eq:['dumbbell'],w0:6}),
  C('oblcr','Seitlicher Crunch','bodyweight','OBLIQUE_CRUNCH',{pats:['lat'],rest:45}),

  // ---- Rücken ----
  C('latpd','Latzug breit','weight','LAT_PULLDOWN',{pats:['vpull'],eq:['cable'],step:1,w0:30,how:'Brust raus, Stange zur oberen Brust ziehen, Ellbogen Richtung Hosentasche. Nicht nach hinten lehnen.'}),
  C('latpdn','Latzug eng, neutraler Griff','weight','NEUTRAL_GRIP_LAT_PULLDOWN',{pats:['vpull'],eq:['cable'],step:1,w0:30,how:'Parallelgriff, Ellbogen eng am Körper zum Brustbein ziehen, oben ganz lang werden lassen.'}),
  C('salpd','Latzug einarmig','weight','SINGLE_ARM_LAT_PULLDOWN',{pats:['vpull'],eq:['cable'],step:1,w0:10,side:true,how:'Einen Griff am Kabel, Ellbogen zur Hüfte ziehen, Oberkörper bleibt ruhig und dreht nicht mit.'}),
  C('cabrow','Rudern am Kabel sitzend','weight','SEATED_CABLE_ROW',{pats:['hpull'],eq:['cable'],step:1,w0:30,how:'Aufrecht sitzen, Knie leicht gebeugt, Griff zum Bauchnabel. Oberkörper schwingt nicht mit, der Rücken bleibt neutral.'}),
  C('mrow','Rudermaschine','weight','MACHINE_SEATED_ROW',{pats:['hpull'],eq:['machine'],step:1,w0:30,how:'Brust ans Polster, Griffe zu dir ziehen, Schulterblätter am Ende zusammen, langsam zurück.'}),
  C('dbrow','Einarmiges Rudern KH','weight','DUMBBELL_ROW',{pats:['hpull'],eq:['dumbbell'],w0:15,side:true,how:'Knie und Hand auf der Bank abstützen, Rücken flach. Hantel zur Hüfte ziehen, nicht reißen.'}),
  // Seal Row raus (Armin, 23.11.): keine passende Bank im Studio
  C('sapd','Überzug am Kabel (gestreckte Arme)','weight','STRAIGHT_ARM_PULLDOWN',{pats:['scap','vpull'],eq:['cable'],step:1,w0:15,how:'Stehend, Arme fast gestreckt, Stange oder Seil in einem Bogen zu den Oberschenkeln drücken. Rumpf fest, kein Hohlkreuz.'}),
  C('pullap','Pull-Apart am Kabel','weight','CABLE_PULL_APART',{pats:['scap'],eq:['cable'],step:1,w0:5,reps:12,how:'Zwei Kabel überkreuz greifen, Arme auf Schulterhöhe auseinanderziehen, Schulterblätter zusammen. Leichtes Gewicht.'}),

  // ---- Drücken ----
  C('mchest','Brustpresse Maschine','weight','MACHINE_CHEST_PRESS',{pats:['press_h'],eq:['machine'],step:1,w0:30,how:'Griffe auf Brusthöhe, Schulterblätter nach hinten-unten, ruhig drücken, nicht ganz durchstrecken.'}),
  C('dbbench','Bankdrücken KH','weight','DUMBBELL_BENCH_PRESS',{pats:['press_h'],eq:['dumbbell'],w0:15,how:'Flachbank, Füße fest am Boden, Hanteln über der Brust zusammenführen. Kein Hohlkreuz.'}),
  C('mshoulder','Schulterpresse Maschine','weight','MACHINE_SEATED_SHOULDER_PRESS',{pats:['press_v'],eq:['machine'],step:1,w0:20,how:'Rücken ans Polster, Griffe über Kopf drücken. Rückenlehne entlastet die LWS.'}),
  C('dbshoulder','Schulterdrücken KH sitzend','weight','SEATED_DUMBBELL_SHOULDER_PRESS',{pats:['press_v'],eq:['dumbbell'],w0:10,how:'Bank fast senkrecht, Rücken anlehnen, Hanteln von Ohrhöhe nach oben drücken.'}),
  C('cablat','Seitheben am Kabel','weight','CABLE_LATERAL_RAISE',{pats:['raise'],eq:['cable'],step:1,w0:4,side:true,how:'Seitlich zum Kabelturm, Griff mit dem entfernten Arm, seitlich bis Schulterhöhe heben. Kein Schwung.'}),

  // ---- Beine & Hüfte ----
  C('slpress','Beinpresse einbeinig','weight','MACHINE_SINGLE_LEG_PRESS',{pats:['knee','single'],eq:['machine'],step:1,w0:30,side:true,how:'Ein Fuß mittig auf die Platte, Knie zeigt Richtung Fuß. Nur so tief, dass das Becken nicht abkippt.'}),
  C('smithlunge','Ausfallschritt an der Multipresse','weight','SMITH_MACHINE_LUNGE',{pats:['single','knee'],eq:['smith'],w0:20,side:true,how:'Stange auf dem oberen Rücken, Schrittstellung, gerade nach unten bis das hintere Knie fast den Boden berührt. Die Führung gibt Halt.'}),
  C('splitsq','Statischer Ausfallschritt KH','weight','STATIC_LUNGE',{pats:['single','balance'],eq:['dumbbell'],w0:8,side:true,how:'Schrittstellung bleibt stehen, nur hoch und runter. Oberkörper aufrecht, Hanteln hängen locker.'}),
  C('latlunge','Seitlicher Ausfallschritt','weight','LATERAL_LUNGE',{pats:['single','balance'],eq:['dumbbell'],w0:6,note:'Wdh. = beide Seiten zusammen.',how:'Breiter Schritt zur Seite, Hüfte nach hinten setzen, das andere Bein bleibt gestreckt. Hantel vor der Brust.'}),
  C('walklunge','Ausfallschritte gehend KH','weight','DUMBBELL_WALKING_LUNGES',{pats:['single','balance'],eq:['dumbbell'],w0:6,reps:20,note:'Wdh. = Schritte gesamt.',how:'Im Gehen abwechselnd tiefe Ausfallschritte. Langsam, Knie bleibt über dem Fuß.'}),
  C('legcurl','Beinbeuger sitzend','weight','MACHINE_LEG_CURL_SEATED',{pats:['ham'],eq:['machine'],step:1,w0:25,how:'Polster knapp über der Ferse, Beine nach unten-hinten beugen, langsam zurück.'}),
  C('slegcurl','Beinbeuger stehend einbeinig','weight','STANDING_LEG_CURL',{pats:['ham','single'],eq:['machine'],step:1,w0:10,side:true,how:'An der Maschine stehen, Ferse zum Po ziehen, Hüfte bleibt gerade.'}),
  C('hipraise','Hüftheben (Glute Bridge)','bodyweight','HIP_RAISE',{pats:['hipext'],reps:12,how:'Rückenlage, Füße aufgestellt, Po hoch bis Knie, Hüfte und Schultern eine Linie bilden. Kurz halten. Kein Hohlkreuz, der Po macht die Arbeit. Optional Hantel auf die Hüfte.'}),
  C('slhip','Hüftheben einbeinig','bodyweight','SINGLE_LEG_HIP_RAISE',{pats:['hipext','balance'],reps:10,side:true,how:'Wie Hüftheben, aber ein Bein gestreckt in der Luft. Becken bleibt waagerecht.'}),
  C('scalf','Wadenheben sitzend','weight','SEATED_CALF_RAISE',{pats:['calf'],eq:['machine'],step:1,reps:15,rest:45,w0:20,how:'Polster auf die Knie, Fersen tief runter, dann ganz hoch auf die Zehen.'}),
  C('rdl','Rumänisches Kreuzheben KH','weight','DUMBBELL_ROMANIAN_DEADLIFTS',{pats:['hinge','ham'],eq:['dumbbell'],lws:'mid',w0:10,how:'Knie leicht gebeugt, Hüfte nach hinten schieben, Hanteln an den Beinen entlang bis knapp unters Knie. Rücken bleibt gerade, leicht anfangen.'}),
  C('slrdl','Kreuzheben einbeinig KH','weight','SINGLE_LEG_ROMANIAN_DEADLIFTS',{pats:['balance','ham'],eq:['dumbbell'],lws:'mid',w0:6,reps:8,side:true,how:'Auf einem Bein, das andere geht gestreckt nach hinten, Oberkörper kippt wie eine Wippe. Wenig Gewicht, Balance ist das Ziel.'}),

  // ---- Rumpf & Stabilität ----
  C('pallof','Pallof Press','weight','PALLOF_PRESS',{pats:['antirot','balance'],eq:['cable'],step:1,w0:5,reps:10,rest:45,side:true,how:'Seitlich zum Kabel auf Brusthöhe, Griff vor der Brust, Arme gerade nach vorne strecken und 2 s halten. Der Rumpf darf sich nicht wegdrehen lassen.'}),
  C('plankh','Unterarmstütz','time','PLANK_HOLD',{pats:['antiext'],secs:40,rest:30,how:'Unterarme unter den Schultern, Körper eine Linie, Po und Bauch fest. Kein Hohlkreuz, lieber kürzer und sauber.'}),
  C('bdeadbug','Deadbug mit Band','bodyweight','BANDED_DEADBUG',{pats:['antiext'],reps:16,rest:45,how:'Wie Deadbug, aber ein Band über dem Kopf (oder ums Kabel) unter Spannung halten. Unterer Rücken bleibt am Boden.'}),
  C('sideleg','Seitstütz mit Beinheben','bodyweight','SIDE_PLANK_LEG_RAISE',{pats:['lat','balance'],reps:10,rest:45,side:true,how:'Seitstütz halten und das obere Bein langsam heben und senken. Hüfte bleibt oben.'}),
  C('revcr','Umgekehrter Crunch','bodyweight','REVERSE_CRUNCH',{pats:['flex'],reps:12,rest:45,how:'Rückenlage, Knie zur Brust rollen, Becken hebt leicht ab. Langsam ablassen, kein Schwung.'}),
  C('hkr','Knieheben hängend','bodyweight','HANGING_KNEE_RAISE',{pats:['flex'],eq:['bar'],reps:10,rest:45,how:'An der Stange hängen, Knie kontrolliert zur Brust ziehen, langsam runter. Nicht schaukeln.'}),

  // ---- Dehnen zum Abschluss (Armin, 23.11.): Zeit pro Seite, alles im Liegen/Knien oder Stehen, keine Vorbeuge im Sitzen ----
  // Kein Strava-exercise_type: landet beim Upload nur als Text in der Beschreibung, nicht als Kraftsatz.
  ...[
    ['st_hipflex','Hüftbeuger-Dehnung im Halbknien','Ein Knie am Boden (Polster drunter), Po anspannen und Becken leicht nach vorne schieben, bis es vorne an der Hüfte zieht. Kein Hohlkreuz. Entlastet den unteren Rücken.'],
    ['st_glute','Gesäß-Dehnung in Rückenlage (Figur 4)','Rückenlage, einen Knöchel aufs andere Knie legen und das untere Bein sanft zur Brust ziehen. Kopf und Rücken bleiben am Boden.'],
    ['st_ham','Beinbeuger-Dehnung mit Handtuch','Rückenlage, Handtuch oder Band um den Fuß, gestrecktes Bein langsam anheben, bis es hinten am Oberschenkel zieht. Das andere Bein bleibt am Boden.'],
    ['st_quad','Oberschenkel-Dehnung seitlich liegend','Auf der Seite liegen, oberen Fuß greifen und Ferse zum Po ziehen. Knie bleiben zusammen, Hüfte leicht nach vorne.'],
    ['st_calf','Waden-Dehnung an der Wand','Hände an die Wand, ein Bein gestreckt nach hinten, Ferse bleibt am Boden. Hüfte nach vorne schieben.'],
    ['st_lat','Lat-Dehnung am Gerät','Mit einer Hand an einer Stange oder einem Gerät festhalten, Hüfte nach hinten-seitlich schieben, bis es seitlich am Rücken zieht. Rücken lang, nicht rund.'],
    ['st_chest','Brust-Dehnung am Türrahmen','Unterarm an Rahmen oder Gerätepfosten, Ellbogen auf Schulterhöhe, Oberkörper langsam wegdrehen, bis es in der Brust zieht.'],
    ['st_child','Kindhaltung','Kniend, Po zu den Fersen, Arme weit nach vorne strecken und ruhig in den Rücken atmen. Bei Druck im unteren Rücken die Knie weiter öffnen.'],
  ].map(([id,name,how])=>C(id,name,'time','',{pats:[id],secs:30,sets:id==='st_child'?2:1,side:id!=='st_child',rest:10,step:5,stretch:true,how})),
].forEach(e=>CAT[e.id]=e);
CAT.cardio={id:'cardio',name:'Cardio Aufwärmen',type:'time',strava:'CARDIO_GENERIC',step:0,rest:30,sets:1,secs:600,pats:[],eq:[],lws:'low'};

const FOCI=[
  {id:'ruecken',name:'Rücken',short:'Zug vertikal und horizontal, Schulterblätter'},
  {id:'beine',name:'Beine & Hüfte',short:'Knielastig, Maschinen, einbeinig, LWS-schonend'},
  {id:'stabi',name:'Stabilität & Rumpf',short:'Balance, Anti-Rotation, Anti-Extension'},
  {id:'ganz',name:'Ganzkörper',short:'Kreuzheben, Drücken, Beine, Zug'},
];
// Rezepte: jeder Slot = Liste erlaubter Bewegungsmuster. Am Ende kommen immer die 2 Rumpf-Slots,
// macht 7 Übungen + Cardio. Mehr passt laut deinen Strava-Einheiten (gut 8 min pro Übung) nicht in 60–70 min.
const TPL={
  ruecken:[['vpull'],['hpull'],['vpull','hpull'],['scap'],['press_h','press_v']],
  beine:[['knee'],['single'],['ham'],['hipext','calf'],['press_h','press_v']],
  stabi:[['balance'],['hpull'],['single','knee'],['press_v','press_h'],['antirot']],
  ganz:[['hinge'],['press_h'],['knee','single'],['vpull','hpull'],['hpull','vpull','scap']],
};
const CORE=[['antiext','flex'],['lat','antirot']];
const MAX_NEW=3;
// Dehnen zum Abschluss: 3 Slots je Schwerpunkt
const STRETCH={
  ruecken:[['st_lat'],['st_chest'],['st_hipflex','st_glute','st_child']],
  beine:[['st_hipflex'],['st_ham','st_quad'],['st_glute','st_calf']],
  stabi:[['st_hipflex'],['st_glute','st_child'],['st_lat','st_chest']],
  ganz:[['st_hipflex'],['st_ham','st_glute'],['st_lat','st_chest']],
};
const isStretchSlot=pats=>pats.every(p=>/^st_/.test(p));
const allSlots=focus=>(TPL[focus]||TPL.ganz).concat(CORE,STRETCH[focus]||STRETCH.ganz);
const V=3; // Version des gespeicherten Vorschlags: höher = alte Vorschläge werden neu erzeugt
const DAY=86400000;

const focusName=id=>(FOCI.find(f=>f.id===id)||{name:'Training'}).name;
// welcher Schwerpunkt war ein Training? Generator-Trainings tragen ihn, feste Pläne zählen als Ganzkörper
function focusOf(h){ if(h.focus) return h.focus; const m=/^gen:(\w+)/.exec(h.plan||''); return m?m[1]:'ganz'; }
function lastByFocus(S){ const t={}; FOCI.forEach(f=>t[f.id]=0); S.history.forEach(h=>{ const f=focusOf(h); if(f in t&&h.start>t[f]) t[f]=h.start; }); return t; }
function suggestFocus(S){ const t=lastByFocus(S); return FOCI.slice().sort((a,b)=>t[a.id]-t[b.id])[0].id; }
function weekCount(S,now){ const d=new Date(now||Date.now()); const wd=(d.getDay()+6)%7; d.setHours(0,0,0,0); const mon=d.getTime()-wd*DAY; return S.history.filter(h=>h.start>=mon).length; }

// Katalogeintrag + deine eigenen Einstellungen (Name, Schritt, Pause, Obergrenze) aus S.exercises
function info(S,id){ const c=CAT[id], o=S.exercises[id]; if(!c) return o||null; if(!o) return c;
  return Object.assign({},c,{name:o.name,type:o.type,step:o.step,rest:o.rest,strava:o.strava||c.strava,cap:o.cap,note:o.note}); }
function lastSession(S,id){ for(let i=S.history.length-1;i>=0;i--){ const e=S.history[i].ex.find(x=>x.ex===id&&x.sets.length); if(e) return {sets:e.sets,start:S.history[i].start}; } return null; }
function known(S){ const k=new Set(); S.history.forEach(h=>h.ex.forEach(e=>k.add(e.ex))); return k; }
function allowed(S,e){
  if(!e||e.id==='cardio') return false;
  if(e.lws==='high'&&!e.lwsOk) return false;                 // Tabu: hohe LWS-Last
  const off=(S.settings&&S.settings.noEquip)||[];
  return !e.eq.some(q=>off.includes(q));
}
// Vorgabe aus einem aktiven Plan übernehmen, wenn die Übung dort vorkommt (z. B. Ausfallschritt 20 Wdh.)
function planPrefs(S,id){ for(const p of S.plans){ if(p.archived) continue; const i=p.items.find(x=>x.ex===id); if(i) return i; } return null; }

// Zielgewicht: letztes Gewicht, +1 Schritt wenn beim letzten Mal alle Sätze die Ziel-Wdh. erreicht haben.
// Kreuzheben (und alles mit Obergrenze): höchstens +2,5 kg und nie über die Obergrenze.
function targetWeight(S,e,reps){
  if(e.type==='time') return null;
  const l=lastSession(S,e.id); const ws=l?l.sets.filter(s=>s.w!=null):[];
  if(!ws.length) return e.type==='bodyweight'?0:e.w0;
  const w=ws[ws.length-1].w;
  let next=w;
  if(e.type==='weight'&&ws.length>=2&&ws.every(s=>s.r>=reps)){
    const inc=e.cap>0?Math.min(e.step||2.5,2.5):(e.step||2.5);
    next=Math.round((w+inc)*100)/100;
  }
  if(e.cap>0) next=Math.min(next,e.cap);
  return next;
}
function makeItem(S,e,isNew,slot){
  const pp=planPrefs(S,e.id);
  const sets=pp?pp.sets:e.sets, reps=e.type==='time'?0:(pp&&pp.reps)||e.reps, secs=e.type==='time'?((pp&&pp.secs)||e.secs):0;
  const it={ex:e.id,sets,reps,secs,isNew:!!isNew,slot};
  const w=targetWeight(S,e,reps); if(w!=null) it.weight=w;
  return it;
}
function pickWeighted(list){ const tot=list.reduce((n,x)=>n+x.w,0); if(tot<=0) return null; let r=Math.random()*tot; for(const x of list){ r-=x.w; if(r<=0) return x.e; } return list[list.length-1].e; }

function candidates(S,pats,usedIds){
  const k=known(S), used=new Set(usedIds||[]);
  return Object.keys(CAT).map(id=>info(S,id)).filter(e=>allowed(S,e)&&!used.has(e.id)&&e.pats.some(p=>pats.includes(p)))
    .map(e=>({e,isNew:!k.has(e.id),last:(lastSession(S,e.id)||{}).start||0}));
}

function generate(S,focus,now){
  now=now||Date.now();
  const slots=allSlots(focus);
  const items=[], used=[]; let fresh=0;
  const cardioPP=planPrefs(S,'cardio');
  items.push({ex:'cardio',sets:1,reps:0,secs:Math.max(600,cardioPP?cardioPP.secs:600),isNew:false,slot:-1});
  const pick=new Array(slots.length).fill(null);
  const choose=(si,onlyNew)=>{
    const c=candidates(S,slots[si],used);
    const st=isStretchSlot(slots[si]);
    const pool=c.filter(x=>!onlyNew||x.isNew).map(x=>{
      let w;
      if(st) return {e:x.e,w:1,isNew:false};                  // Dehnen zählt nicht als „neue Übung“
      if(x.isNew) w=fresh<MAX_NEW?1.2:0;                     // neue Übungen: willkommen, aber max. 3
      else{ w=3; const ago=(now-x.last)/DAY; if(ago<3) w=0.8; else if(ago<6) w=1.8; }  // Kürzliches darf ruhen
      return {e:x.e,w,isNew:x.isNew};
    });
    // Ganzkörper = Kreuzheben-Tag: der Hinge-Slot nimmt Kreuzheben, solange es erlaubt ist
    const dl=focus==='ganz'&&slots[si].includes('hinge')&&pool.find(x=>x.e.id==='dl');
    const e=dl?dl.e:pickWeighted(pool); if(!e) return;
    const isNew=pool.find(x=>x.e===e).isNew; if(isNew) fresh++;
    used.push(e.id); pick[si]=makeItem(S,e,isNew,si);
  };
  // 1. Slots, für die du noch keine passende Übung kennst, bekommen zuerst das Kontingent für neue
  slots.forEach((pats,si)=>{ if(!isStretchSlot(pats)&&!candidates(S,pats,used).some(x=>!x.isNew)) choose(si,true); });
  // 2. Rest normal füllen
  slots.forEach((pats,si)=>{ if(!pick[si]) choose(si,false); });
  pick.forEach(it=>{ if(it) items.push(it); });
  return {v:V,focus,created:now,items};
}
function slotPats(focus,si){ return allSlots(focus)[si]||[]; }

// grobe Dauer: Arbeit + Pause + Einstellen pro Satz, 1,5 min Wechsel pro Übung (an deinen Strava-Einheiten geeicht)
function estimate(S,items){
  let sec=0;
  items.forEach(it=>{ const e=info(S,it.ex)||{}; const work=e.type==='time'?(it.secs||40):Math.max(30,(it.reps||10)*3.5);
    sec+=it.ex==='cardio'?it.secs+60:e.stretch?it.sets*(e.side?2:1)*(work+(e.rest||10)+5)+30:it.sets*((e.side?2*work+10:work)+(e.rest||60)+30)+90; });
  return Math.round(sec/60/5)*5;
}

return {V,STRETCH,CAT,FOCI,EQUIP,TPL,CORE,MAX_NEW,focusName,focusOf,lastByFocus,suggestFocus,weekCount,info,candidates,generate,slotPats,makeItem,estimate,targetWeight,known};
})();
