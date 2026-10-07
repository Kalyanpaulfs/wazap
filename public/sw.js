const CACHE = 'wazap-v11-20261008-public-offline';
const OFFLINE = ['/', '/qr', '/icon.svg', '/manifest.json'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE)));self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('wazap-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch', event => {
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!OFFLINE.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(async()=>{const saved=await caches.match(event.request);if(saved)return saved;if(event.request.mode==='navigate')return (await caches.match('/'))||Response.error();return Response.error();}));
});
