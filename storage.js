import { groups, ratings, sections } from './criteria.js';

export const RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
export const ROSTER_KEY = 'aquabears.progress.v1.swimmers';
export const REVIEW_PREFIX = 'aquabears.progress.v1.review.';
export class StoreError extends Error {
  constructor(message, code = 'storage') { super(message); this.code = code; }
}
export function localDate(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function blankReview(swimmerId, now = Date.now()) {
  return { version:1, swimmerId, createdAt:now, updatedAt:now, revision:0,
    date:localDate(now), answers:{}, remedial:'' };
}
export function createStore(storage, clock = Date.now) {
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
  const read = key => {
    try { const raw = storage.getItem(key); return raw === null ? null : JSON.parse(raw); }
    catch { throw new StoreError('Saved data could not be read. It has not been overwritten.', 'unreadable'); }
  };
  const write = (key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); }
    catch { throw new StoreError('Could not save on this device. Keep this screen open and download your PDF.'); }
  };
  const remove = key => {
    try { storage.removeItem(key); }
    catch { throw new StoreError('Could not remove saved data on this device.'); }
  };
  function listSwimmers() {
    const list = read(ROSTER_KEY) ?? [];
    if (!Array.isArray(list) || list.some(s => !s || !validId(s.id) ||
      typeof s.firstName !== 'string' || typeof s.lastName !== 'string' || !groups.includes(s.group))) {
      throw new StoreError('The saved swimmer list could not be read. It has not been overwritten.', 'unreadable');
    }
    return list;
  }
  function saveSwimmer(swimmer) {
    const firstName = String(swimmer.firstName || '').trim();
    const lastName = String(swimmer.lastName || '').trim();
    if (!validId(swimmer.id) || !firstName || !lastName || firstName.length > 80 || lastName.length > 80 || !groups.includes(swimmer.group)) {
      throw new StoreError('Enter a first name, last name and group.', 'validation');
    }
    const list = listSwimmers(), index = list.findIndex(s => s.id === swimmer.id);
    const saved = { id:swimmer.id, firstName, lastName, group:swimmer.group };
    if (index < 0) list.push(saved); else list[index] = saved;
    write(ROSTER_KEY, list);
    return saved;
  }
  function deleteSwimmer(id) {
    if (!validId(id)) throw new StoreError('Invalid swimmer.', 'validation');
    const list = listSwimmers().filter(s => s.id !== id);
    // Remove the review first so a partial failure never leaves an orphaned review.
    remove(REVIEW_PREFIX + id);
    write(ROSTER_KEY, list);
  }
  function validateReview(r, id) {
    if (!r || r.version !== 1 || r.swimmerId !== id || !Number.isFinite(r.createdAt) ||
      !Number.isInteger(r.revision) || !r.answers || typeof r.answers !== 'object' ||
      typeof r.remedial !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      throw new StoreError('This saved review could not be read. It has not been overwritten.', 'unreadable');
    }
    for (const [key, answer] of Object.entries(r.answers)) {
      if (!sections.some(s => String(s.id) === key) || !answer ||
        !ratings.some(v => v.label === answer.rating) || typeof answer.comments !== 'string') {
        throw new StoreError('This saved review could not be read. It has not been overwritten.', 'unreadable');
      }
    }
    return r;
  }
  function loadReview(id) {
    if (!validId(id)) throw new StoreError('Invalid swimmer.', 'validation');
    const value = read(REVIEW_PREFIX + id);
    if (value === null) return blankReview(id, clock());
    const r = validateReview(value, id);
    if (clock() >= r.createdAt + RETENTION_MS) {
      remove(REVIEW_PREFIX + id);
      return blankReview(id, clock());
    }
    return r;
  }
  function saveReview(review) {
    const id = review.swimmerId;
    if (!validId(id) || !listSwimmers().some(s => s.id === id)) throw new StoreError('This swimmer has been removed.', 'deleted');
    validateReview(review, id);
    if (clock() >= review.createdAt + RETENTION_MS) {
      remove(REVIEW_PREFIX + id);
      throw new StoreError('This review has reached its five-day limit and has been cleared.', 'expired');
    }
    const existing = read(REVIEW_PREFIX + id);
    if ((existing?.revision ?? 0) !== review.revision) {
      throw new StoreError('This review changed in another window. Download this draft or reopen the saved review.', 'conflict');
    }
    const next = { ...review, updatedAt:clock(), revision:review.revision+1 };
    write(REVIEW_PREFIX + id, next);
    return next;
  }
  function clearReview(id) { remove(REVIEW_PREFIX + id); }
  function cleanup() {
    const ids = new Set(listSwimmers().map(s => s.id)), keys = [];
    try { for (let i=0; i<storage.length; i++) keys.push(storage.key(i)); }
    catch { throw new StoreError('Could not check stored reviews.'); }
    let removed = 0;
    for (const key of keys) {
      if (!key?.startsWith(REVIEW_PREFIX)) continue;
      const id = key.slice(REVIEW_PREFIX.length);
      if (!ids.has(id)) { remove(key); removed++; continue; }
      const r = validateReview(read(key), id);
      if (clock() >= r.createdAt + RETENTION_MS) { remove(key); removed++; }
    }
    return removed;
  }
  return { listSwimmers, saveSwimmer, deleteSwimmer, loadReview, saveReview, clearReview, cleanup };
}
