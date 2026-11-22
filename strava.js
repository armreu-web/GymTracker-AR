// Strava: verbinden (OAuth), Token erneuern, Krafttraining als JSON hochladen.
// Client-ID und Client-Secret gibt der Nutzer einmal in der App ein; sie liegen nur im localStorage
// dieses Geräts und nie im Code oder im Repo.
window.GTStrava=(function(){
'use strict';
const KEY='gymtracker.strava';
const AUTH='https://www.strava.com/oauth/authorize';
const TOKEN='https://www.strava.com/oauth/token';
const API='https://www.strava.com/api/v3';

// Auswahl aus Stravas exercise_type-Katalog (Upload-Doku, Stand Nov. 2026) für die Vorschlagsliste
const TYPES=('BARBELL_DEADLIFT DEADLIFT_GENERIC TRAP_BAR_DEADLIFT DUMBBELL_DEADLIFT ROMANIAN_DEADLIFTS DUMBBELL_ROMANIAN_DEADLIFTS SINGLE_LEG_ROMANIAN_DEADLIFTS RACK_PULL '+
'BENCH_PRESS_GENERIC BARBELL_BENCH_PRESS DUMBBELL_BENCH_PRESS INCLINE_DUMBBELL_BENCH_PRESS INCLINE_BARBELL_BENCH_PRESS DECLINE_DUMBBELL_BENCH_PRESS SMITH_MACHINE_INCLINE_BENCH_PRESS CHEST_PRESS MACHINE_CHEST_PRESS MACHINE_INCLINE_CHEST_PRESS '+
'LUNGE_GENERIC REVERSE_LUNGE DUMBBELL_REVERSE_LUNGE BARBELL_REVERSE_LUNGE WALKING_LUNGE DUMBBELL_WALKING_LUNGES LATERAL_LUNGE SIDE_LUNGE STATIC_LUNGE SMITH_MACHINE_LUNGE '+
'ROW_GENERIC CHEST_SUPPORTED_ROW MACHINE_CHEST_SUPPORTED_ROW SEATED_CABLE_ROW MACHINE_SEATED_ROW DUMBBELL_ROW BENT_OVER_ROW BENT_OVER_BARBELL_ROW BENT_OVER_DUMBBELL_ROW T_BAR_ROW SUSPENSION_LOW_ROW INVERTED_ROW SEAL_ROW '+
'PULL_UP_GENERIC NEGATIVE_PULL_UP MACHINE_ASSISTED_PULL_UP NEUTRAL_GRIP_PULL_UP LAT_PULLDOWN CABLE_LAT_PULLDOWN_CLOSE_GRIP NEUTRAL_GRIP_LAT_PULLDOWN UNDERHAND_LAT_PULLDOWN SINGLE_ARM_LAT_PULLDOWN STRAIGHT_ARM_PULLDOWN FACE_PULL CABLE_PULL_APART BAND_PULLAPARTS '+
'SHOULDER_PRESS_GENERIC OVERHEAD_DUMBBELL_PRESS SEATED_DUMBBELL_SHOULDER_PRESS MACHINE_SEATED_SHOULDER_PRESS OVERHEAD_BARBELL_PRESS LATERAL_RAISE_GENERIC CABLE_LATERAL_RAISE SEATED_DUMBBELL_LATERAL_RAISE FRONT_RAISE '+
'CURL_GENERIC STANDING_DUMBBELL_BICEPS_CURL DUMBBELL_HAMMER_CURL BARBELL_BICEPS_CURL CABLE_BICEPS_CURL MACHINE_BICEP_CURL TRICEPS_PRESSDOWN SEATED_TRICEPS_PRESS '+
'LEG_PRESS MACHINE_LEG_PRESS MACHINE_SINGLE_LEG_PRESS LEG_CURL_GENERIC MACHINE_LEG_CURL_SEATED STANDING_LEG_CURL NORDIC_CURL CALF_RAISE_GENERIC STANDING_CALF_RAISE SEATED_CALF_RAISE MACHINE_CALF_PRESS HIP_RAISE HIP_RAISE_GENERIC SINGLE_LEG_HIP_RAISE '+
'PLANK_GENERIC PLANK_HOLD SIDE_PLANK SIDE_PLANK_HOLD SIDE_PLANK_LEG_RAISE DEADBUG BANDED_DEADBUG PALLOF_PRESS CABLE_CORE_PRESS CRUNCH CABLE_CRUNCH REVERSE_CRUNCH OBLIQUE_CRUNCH BICYCLE_CRUNCH AB_CRUNCH_MACHINE HANGING_KNEE_RAISE HANGING_LEG_RAISE LEG_RAISE_GENERIC '+
'CARDIO_GENERIC WARM_UP_GENERIC').split(' ');

function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
function store(c){ try{ localStorage.setItem(KEY,JSON.stringify(c)); }catch(e){} }
const cfg=()=>load();
function setCreds(id,secret){ const c=load(); c.clientId=String(id||'').trim(); if(secret) c.clientSecret=String(secret).trim(); store(c); }
function connected(){ const c=load(); return !!(c.refreshToken&&c.clientId&&c.clientSecret); }
function hasCreds(){ const c=load(); return !!(c.clientId&&c.clientSecret); }
function disconnect(){ const c=load(); delete c.accessToken; delete c.refreshToken; delete c.expiresAt; delete c.athlete; store(c); }
function forget(){ store({}); }
function redirectUri(){ return location.origin+location.pathname; }

function authUrl(){
  const c=load(); const state=Math.random().toString(36).slice(2); c.state=state; store(c);
  const q=new URLSearchParams({client_id:c.clientId,redirect_uri:redirectUri(),response_type:'code',approval_prompt:'auto',scope:'activity:write',state});
  return AUTH+'?'+q.toString();
}
async function tokenCall(params){
  const c=load();
  const body=new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,...params});
  let r;
  try{ r=await fetch(TOKEN,{method:'POST',body}); }catch(e){ throw new Error('Keine Verbindung zu Strava. Netz da?'); }
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(r.status===400||r.status===401?'Strava lehnt ab: Client-ID/Secret oder Code passt nicht.':'Strava-Fehler '+r.status);
  c.accessToken=j.access_token; c.refreshToken=j.refresh_token||c.refreshToken; c.expiresAt=j.expires_at;
  if(j.athlete) c.athlete={id:j.athlete.id,name:[j.athlete.firstname,j.athlete.lastname].filter(Boolean).join(' ')};
  store(c); return j;
}
async function exchange(code,scope){
  if(scope!=null&&!String(scope).includes('activity:write')) throw new Error('Beim Verbinden fehlte der Haken „Aktivitäten hochladen“. Bitte nochmal verbinden und alles erlauben.');
  return tokenCall({code,grant_type:'authorization_code'});
}
async function token(){
  const c=load(); if(!c.refreshToken) throw new Error('Strava ist nicht verbunden.');
  if(c.accessToken&&c.expiresAt&&c.expiresAt*1000>Date.now()+120000) return c.accessToken;
  await tokenCall({grant_type:'refresh_token',refresh_token:c.refreshToken});
  return load().accessToken;
}

// Training -> Strava-JSON. exOf(id) liefert {name,type,strava}.
function build(w,exOf){
  const sets=[], missing=[], lines=[];
  w.ex.forEach(e=>{
    const x=exOf(e.ex); const t=(x.strava||'').trim().toUpperCase();
    lines.push(x.name+': '+e.sets.map(s=>s.s!=null?s.s+' s':(s.w?(+s.w).toLocaleString('de-DE')+' kg × ':'')+s.r).join(', '));
    if(!t){ missing.push(x.name); return; }
    e.sets.forEach(s=>{
      const o={exercise_type:t};
      if(s.s!=null) o.duration=Math.max(1,Math.round(s.s));
      else{ o.repetitions=s.r; if(s.w) o.weight=+s.w; }
      if(s.t) o.start_time=new Date(s.t).toISOString();
      sets.push(o);
    });
  });
  const tz=-new Date(w.start).getTimezoneOffset()*60;
  const json={version:'1.0',start_time:new Date(w.start).toISOString(),utc_offset:tz,
    elapsed_time:Math.max(60,Math.round((w.end-w.start)/1000)),creator:{name:'GymTracker'},sets};
  const desc=lines.join('\n')+(missing.length?'\n\nOhne Strava-Zuordnung: '+missing.join(', '):'')+'\n\nGeloggt mit GymTracker';
  return {json,desc,missing,count:sets.length};
}

async function upload(w,exOf,onStep){
  const b=build(w,exOf);
  if(!b.count) throw new Error('Keine Übung hat eine Strava-Zuordnung. Unter Pläne → Übung → „Strava-Übung“ eintragen.');
  const tok=await token();
  const fd=new FormData();
  fd.append('file',new Blob([JSON.stringify(b.json)],{type:'application/json'}),'gymtracker-'+w.id+'.json');
  fd.append('data_type','json'); fd.append('sport_type','WeightTraining');
  fd.append('name',w.name||'Krafttraining'); fd.append('description',b.desc); fd.append('external_id','gymtracker-'+w.id);
  onStep&&onStep('Wird hochgeladen …');
  let r;
  try{ r=await fetch(API+'/uploads',{method:'POST',headers:{Authorization:'Bearer '+tok},body:fd}); }catch(e){ throw new Error('Keine Verbindung zu Strava. Später nochmal versuchen.'); }
  let j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(errText(j)||'Upload abgelehnt ('+r.status+').');
  onStep&&onStep('Strava verarbeitet …');
  for(let i=0;i<30&&!j.activity_id&&!j.error;i++){
    await new Promise(res=>setTimeout(res,1500));
    const s=await fetch(API+'/uploads/'+j.id_str,{headers:{Authorization:'Bearer '+tok}}).catch(()=>null);
    if(s&&s.ok) j=await s.json().catch(()=>j);
  }
  if(j.error){ const m=String(j.error); const dup=m.match(/duplicate of[^0-9]*(\d+)/i); if(dup) return {activityId:dup[1],duplicate:true,missing:b.missing}; throw new Error(stripHtml(m)); }
  if(!j.activity_id) return {pending:true,uploadId:j.id_str,missing:b.missing};
  return {activityId:String(j.activity_id),missing:b.missing};
}
function errText(j){ if(!j) return ''; if(j.error) return stripHtml(j.error); if(j.message) return j.message+(j.errors&&j.errors[0]?': '+[j.errors[0].field,j.errors[0].code].filter(Boolean).join(' '):''); return ''; }
function stripHtml(s){ return String(s).replace(/<[^>]*>/g,'').trim(); }

// Rückkehr von Strava: ?code=...&scope=...&state=...
function readCallback(){
  const q=new URLSearchParams(location.search);
  if(!q.has('code')&&!q.has('error')) return null;
  const res={code:q.get('code'),scope:q.get('scope'),error:q.get('error'),state:q.get('state')};
  history.replaceState(null,'',location.pathname);
  return res;
}
return {TYPES,cfg,setCreds,connected,hasCreds,disconnect,forget,authUrl,exchange,upload,build,readCallback,redirectUri};
})();
