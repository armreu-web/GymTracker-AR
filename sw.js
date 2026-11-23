// Offline-Cache: App-Shell cache-first, bei neuer Version wird CACHE hochgezählt.
const CACHE='gymtracker-v0.6.2';
const FILES=['./','index.html','style.css','app.js','seed.js','strava.js','generator.js','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url); if(url.origin!==location.origin) return;
  // Netz zuerst (damit Updates ankommen), Cache als Fallback im Keller-Gym
  e.respondWith(fetch(e.request).then(r=>{ const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
