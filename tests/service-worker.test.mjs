import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=new URL('../',import.meta.url);
const code=readFileSync(new URL('sw.js',root),'utf8');
function harness(fail='') {
  const listeners={},data=new Map([['unrelated-app',new Map()],['aquabears-progress-report-old',new Map()]]);
  const caches={keys:async()=>[...data.keys()],delete:async key=>data.delete(key),open:async key=>{
    if(!data.has(key))data.set(key,new Map());const cache=data.get(key);
    return {put:async(url,res)=>cache.set(typeof url==='string'?url:url.url,res),match:async key=>cache.get(typeof key==='string'?key:key.url)};
  }};
  let network=true,claimed=false;
  const fetch=async url=>{
    if(!network || String(url).endsWith(fail)&&fail)throw Error('Offline or missing asset');
    const name=new URL(url).pathname.replace('/Progress-Report/','');
    const file=new URL(name,root);assert.ok(existsSync(file),`Missing offline asset ${name}`);
    const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.png')?'image/png':name.endsWith('.jpg')?'image/jpeg':'font/ttf';
    return new Response(readFileSync(file),{headers:{'content-type':type}});
  };
  const self={location:'https://johnweaver22.github.io/Progress-Report/sw.js',addEventListener:(name,fn)=>listeners[name]=fn,clients:{claim:async()=>{claimed=true;}},skipWaiting:async()=>{}};
  vm.runInNewContext(code,{self,caches,fetch,URL,Response,Error});
  return {data,listeners,offline:()=>network=false,claimed:()=>claimed,event:async name=>{let promise;listeners[name]({waitUntil:p=>promise=p});await promise;}};
}
test('the complete app and PDF assets are cached, with no cross-app cache deletion',async()=>{
  const h=harness();await h.event('install');await h.event('activate');
  assert.ok(h.claimed());assert.ok(h.data.has('unrelated-app'));assert.ok(!h.data.has('aquabears-progress-report-old'));
  const cache=h.data.get('aquabears-progress-report-v1.0.0');assert.equal(cache.size,15);
  h.offline();let response;
  h.listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://johnweaver22.github.io/Progress-Report/'},respondWith:p=>response=p});
  assert.match(await(await response).text(),/Swimmer Development Review/);
  for(const asset of ['pdf.js','vendor/jspdf.umd.min.js','assets/DejaVuSans.ttf']) {
    h.listeners.fetch({request:{method:'GET',mode:'cors',url:'https://johnweaver22.github.io/Progress-Report/'+asset},respondWith:p=>response=p});
    assert.ok((await(await response).arrayBuffer()).byteLength>100);
  }
});
test('an incomplete update does not replace the working offline cache',async()=>{
  const h=harness('assets/DejaVuSans.ttf');await assert.rejects(h.event('install'));
  assert.ok(h.data.has('aquabears-progress-report-old'));
  assert.ok(!h.data.has('aquabears-progress-report-v1.0.0'));
});
