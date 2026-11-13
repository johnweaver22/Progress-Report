'use strict';
const CACHE_PREFIX = 'aquabears-progress-report-';
const CACHE = CACHE_PREFIX + 'v1.0.0';
const SHELL = [
  './index.html','./styles.css','./app.js','./criteria.js','./storage.js','./pdf.js',
  './manifest.webmanifest','./vendor/jspdf.umd.min.js',
  './assets/logo.png','./assets/logo.jpg','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png',
  './assets/DejaVuSans.ttf','./assets/DejaVuSans-Bold.ttf'
];
const BASE = new URL('./',self.location);
const URLS = SHELL.map(path=>new URL(path,BASE).href);
async function valid(response,url) {
  if (!response.ok || response.redirected) return false;
  const pathname=new URL(url).pathname, mime=response.headers.get('content-type') || '';
  if(pathname.endsWith('.html')) return /html/.test(mime) && (await response.clone().text()).includes('<title>Aquabears | Swimmer Development Review</title>');
  if(pathname.endsWith('.png')) return /image\/png/.test(mime);
  if(pathname.endsWith('.jpg')) return /image\/jpeg/.test(mime);
  if(pathname.endsWith('.js')) return /javascript/.test(mime);
  if(pathname.endsWith('.css')) return /css/.test(mime);
  if(pathname.endsWith('.webmanifest')) return /json|manifest/.test(mime);
  return (await response.clone().arrayBuffer()).byteLength>1000;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  // Validate the full release before caching any part of it. A failed update
  // leaves the active worker and its complete offline shell available.
  const responses=await Promise.all(URLS.map(async url=>{
    const response=await fetch(url,{cache:'reload',credentials:'same-origin',redirect:'error'});
    if(!await valid(response,url)) throw Error('Incomplete Aquabears update');
    return response;
  }));
  const cache=await caches.open(CACHE);
  try { await Promise.all(URLS.map((url,i)=>cache.put(url,responses[i]))); }
  catch(error) { await caches.delete(CACHE); throw error; }
  // Updates wait until the coach applies them or closes all app windows.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith(CACHE_PREFIX) && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET' || url.origin!==BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if(request.mode==='navigate' && (url.pathname===BASE.pathname || url.pathname===BASE.pathname+'index.html')) {
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      return (await cache.match(new URL('index.html',BASE).href)) || fetch(request);
    })()); return;
  }
  if(URLS.includes(url.href)) event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(request)) || fetch(request);
  })());
});
