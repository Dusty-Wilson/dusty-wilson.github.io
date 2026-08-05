const CACHE='meal-plan-shell-v2';const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;if(u.pathname.includes('/plans/')||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/'))e.respondWith(networkFirst(r));else e.respondWith(cacheFirst(r))});
async function networkFirst(r){try{const fresh=await fetch(r,{cache:'no-store'}),c=await caches.open(CACHE);c.put(r,fresh.clone());return fresh}catch{return await caches.match(r)||new Response('Offline',{status:503})}}
async function cacheFirst(r){const cached=await caches.match(r);if(cached)return cached;const resp=await fetch(r),c=await caches.open(CACHE);c.put(r,resp.clone());return resp}
