import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createStore,blankReview,RETENTION_MS,ROSTER_KEY,REVIEW_PREFIX} from '../storage.js';
import {ratings} from '../criteria.js';
class MemoryStorage {
  data=new Map(); fail=false;
  get length(){return this.data.size;}
  key(i){return [...this.data.keys()][i] ?? null;}
  getItem(k){return this.data.get(k) ?? null;}
  setItem(k,v){if(this.fail)throw Error('Quota exceeded');this.data.set(k,v);}
  removeItem(k){this.data.delete(k);}
}
function fixture(){
  const storage=new MemoryStorage(); let now=1000000000;
  const store=createStore(storage,()=>now);
  store.saveSwimmer({id:'alex',firstName:'Alex',lastName:'Taylor',group:'Browns'});
  return {storage,store,advance:n=>now+=n,time:()=>now};
}
test('swimmers and independent reviews persist after reopening',()=>{
  const f=fixture();
  f.store.saveSwimmer({id:'sam',firstName:'Sam',lastName:'Lee',group:'Blues'});
  let r=f.store.loadReview('alex');r.answers[0]={rating:ratings[1].label,comments:'On time in the water.'};f.store.saveReview(r);
  const reopened=createStore(f.storage,f.time);
  assert.equal(reopened.listSwimmers().length,2);
  assert.equal(reopened.loadReview('alex').answers[0].comments,'On time in the water.');
  assert.deepEqual(reopened.loadReview('sam').answers,{});
});
test('review expires at exactly five days and editing does not extend retention',()=>{
  const f=fixture();let r=f.store.saveReview(f.store.loadReview('alex'));
  f.advance(RETENTION_MS-1);r.remedial='A final edit';r=f.store.saveReview(r);
  assert.equal(f.store.loadReview('alex').remedial,'A final edit');
  f.advance(1);assert.equal(f.store.cleanup(),1);
  assert.equal(f.storage.getItem(REVIEW_PREFIX+'alex'),null);
  assert.equal(f.store.listSwimmers().length,1);
  assert.deepEqual(f.store.loadReview('alex').answers,{});
});
test('opening a swimmer without editing does not persist a review',()=>{
  const f=fixture();f.store.loadReview('alex');
  assert.equal(f.storage.getItem(REVIEW_PREFIX+'alex'),null);
});
test('renaming or moving groups preserves the review and deletion removes it',()=>{
  const f=fixture();let r=f.store.loadReview('alex');r.remedial='Keep these next steps';f.store.saveReview(r);
  f.store.saveSwimmer({id:'alex',firstName:'Élodie',lastName:'O’Neill',group:'Polars'});
  assert.equal(f.store.loadReview('alex').remedial,'Keep these next steps');
  assert.equal(f.store.listSwimmers()[0].group,'Polars');
  f.store.deleteSwimmer('alex');assert.equal(f.store.listSwimmers().length,0);
  assert.equal(f.storage.getItem(REVIEW_PREFIX+'alex'),null);
});
test('quota failures never report a saved revision or overwrite prior data',()=>{
  const f=fixture();const r=f.store.saveReview(f.store.loadReview('alex'));
  f.storage.fail=true;r.remedial='Unsaved draft';assert.throws(()=>f.store.saveReview(r),/Could not save/);
  assert.equal(f.store.loadReview('alex').remedial,'');
  assert.equal(r.revision,1);
});
test('concurrent changes are rejected instead of silently overwriting',()=>{
  const f=fixture();const a=f.store.loadReview('alex'),b=f.store.loadReview('alex');
  a.remedial='Saved in another tab';f.store.saveReview(a);
  b.remedial='Stale draft';assert.throws(()=>f.store.saveReview(b),e=>e.code==='conflict');
  assert.equal(f.store.loadReview('alex').remedial,'Saved in another tab');
});
test('expired in-memory reviews cannot resurrect removed results',()=>{
  const f=fixture();const r=f.store.saveReview(f.store.loadReview('alex'));
  f.advance(RETENTION_MS);assert.throws(()=>f.store.saveReview(r),e=>e.code==='expired');
  assert.equal(f.storage.getItem(REVIEW_PREFIX+'alex'),null);
});
test('cleanup preserves other apps and rejects malformed records without overwriting',()=>{
  const f=fixture();f.storage.setItem('other-app','do not delete');
  f.storage.setItem(REVIEW_PREFIX+'orphan',JSON.stringify(blankReview('orphan',f.time())));
  f.store.cleanup();assert.equal(f.storage.getItem('other-app'),'do not delete');
  f.storage.setItem(ROSTER_KEY,'broken');assert.throws(()=>f.store.saveSwimmer({id:'new',firstName:'A',lastName:'B',group:'Blues'}));
  assert.equal(f.storage.getItem(ROSTER_KEY),'broken');
});
