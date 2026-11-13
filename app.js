import { sections, ratings, groups, groupTargets } from './criteria.js';
import { createStore, blankReview, RETENTION_MS, ROSTER_KEY, REVIEW_PREFIX } from './storage.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fullName = s => `${s.firstName} ${s.lastName}`;
const dateText = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
let store, swimmers = [], selectedId = null, review = null, active = 0, editingId = null;
let confirmAction = null, pdfURL = null, pdfFile = null, pdfGeneration = 0, deferredInstall = null;
let swRegistration = null, applyingUpdate = false, unsaved = new Set();
const drafts = new Map();
const current = () => swimmers.find(s => s.id === selectedId);
function showError(error) {
  $('error-banner').hidden = false;
  $('error-text').textContent = error.message || String(error);
  $('reload-review').hidden = error.code !== 'conflict';
}
function clearError() { $('error-banner').hidden = true; $('reload-review').hidden = true; }
function notice(text) { $('notice').textContent = text; $('notice').hidden = !text; }
function refreshSwimmers() {
  swimmers = store.listSwimmers().sort((a,b) => fullName(a).localeCompare(fullName(b),'en-GB'));
  if (!swimmers.some(s => s.id === selectedId)) selectedId = swimmers[0]?.id ?? null;
  $('swimmer-select').innerHTML = swimmers.map(s => `<option value="${s.id}">${escapeHTML(fullName(s))} · ${escapeHTML(s.group)}</option>`).join('');
  $('swimmer-select').value = selectedId || '';
  $('pdf-button').disabled = !selectedId;
}
function selectSwimmer(id) {
  const loaded = drafts.get(id) || store.loadReview(id);
  selectedId = id; review = loaded;
  drafts.set(id, review);
  active = 0;
  $('swimmer-select').value = id;
}
function saveDraft() {
  if (!review) return;
  if (review.revision === 0 && !unsaved.has(selectedId)) review.createdAt = Date.now();
  try {
    review = store.saveReview(review);
    drafts.set(selectedId, review);
    unsaved.delete(selectedId);
    $('save-status').textContent = 'Saved on this device';
    $('save-status').classList.remove('failed');
    clearError();
  } catch (e) {
    drafts.set(selectedId, review); unsaved.add(selectedId);
    $('save-status').textContent = 'Not saved · see message above';
    $('save-status').classList.add('failed');
    showError(e);
    if (e.code === 'expired') expireReviews();
  }
  renderProgress();
  renderRetention();
}
function answer() {
  return review.answers[active] ||= {rating:ratings[4].label, comments:''};
}
function renderProgress() {
  if (!review) return;
  const assessed = Object.values(review.answers).filter(a => a.rating && a.rating !== ratings[4].label).length;
  $('progress-text').textContent = `${assessed} of 11 assessed`;
  $('progress').value = assessed;
  for (const button of $('section-nav').querySelectorAll('[data-section]')) {
    const id = Number(button.dataset.section);
    const done = id === 11 ? Boolean(review.remedial.trim()) : Boolean(review.answers[id]?.rating && review.answers[id].rating !== ratings[4].label);
    button.querySelector('.dot').classList.toggle('done', done);
  }
}
function renderRetention() {
  if (!review) return;
  $('retention-text').textContent = review.revision || unsaved.has(selectedId)
    ? `Review clears ${dateText(review.createdAt + RETENTION_MS)}. Download your PDF to keep it.`
    : 'Reviews clear five days after you start writing. Download a PDF to keep it.';
}
function renderNavigation() {
  const categories = ['Training','Performance','Aquabears Creed'];
  $('section-nav').innerHTML = categories.map(group => `<div class="nav-group"><h3>${group}</h3>${sections.filter(s => s.group === group).map(s => `<button class="nav-item" type="button" data-section="${s.id}"${active === s.id ? ' aria-current="step"':''}><span class="dot" aria-hidden="true"></span><span>${s.title}</span></button>`).join('')}</div>`).join('') +
    `<div class="nav-group"><h3>Next steps</h3><button class="nav-item" type="button" data-section="11"${active === 11 ? ' aria-current="step"':''}><span class="dot" aria-hidden="true"></span>Remedial action</button></div>`;
  $('section-select').innerHTML = categories.map(group => `<optgroup label="${group}">${sections.filter(s => s.group === group).map(s => `<option value="${s.id}">${s.title}</option>`).join('')}</optgroup>`).join('') + '<option value="11">Remedial action</option>';
  $('section-select').value = String(active);
  renderProgress();
}
function renderReview(focus = false) {
  if (!current() || !review) return;
  const swimmer = current(), section = sections[active], remedial = active === 11;
  $('review-date').value = review.date;
  $('group-target').hidden = !groupTargets[swimmer.group];
  $('target-text').textContent = groupTargets[swimmer.group] || '';
  $('section-group').textContent = remedial ? 'Next steps' : section.group;
  $('step-count').textContent = remedial ? 'Optional' : `${active + 1} / 11`;
  $('section-title').textContent = remedial ? 'Remedial action' : section.title;
  $('section-note').textContent = remedial ? 'Agreed actions and next steps. This section appears in the PDF only when something is written here.' : section.note;
  $('rating-field').hidden = remedial;
  $('preset-field').hidden = remedial || !section.presets.length;
  $('comments-label').textContent = remedial ? 'Remedial action' : 'Coach comments';
  $('comments-help').textContent = remedial ? 'Leave blank to omit this section from the PDF.' : 'Included in the swimmer’s PDF when completed.';
  $('comments').value = remedial ? review.remedial : (review.answers[active]?.comments || '');
  $('comments').placeholder = remedial ? 'Write agreed actions and next steps…' : 'Write your comments…';
  if (!remedial) {
    $('rating-select').value = review.answers[active]?.rating || ratings[4].label;
    $('rating-meaning').textContent = ratings.find(r => r.label === $('rating-select').value).note;
    $('preset-select').innerHTML = '<option value="">Choose a comment to add…</option>' + section.presets.map((p,i) => `<option value="${i}">${escapeHTML(p.replaceAll('[Name]',swimmer.firstName))}</option>`).join('');
  }
  $('previous-button').disabled = active === 0;
  $('next-button').textContent = remedial ? 'Generate PDF ↗' : 'Next →';
  $('save-status').textContent = unsaved.has(selectedId) ? 'Not saved · see message above' : review.revision ? 'Saved on this device' : 'Ready';
  $('save-status').classList.toggle('failed', unsaved.has(selectedId));
  renderNavigation(); renderRetention();
  if (focus) $('section-title').focus({preventScroll:true});
}
function showPage() {
  const manager = location.hash === '#swimmers';
  $('empty-view').hidden = manager || Boolean(selectedId);
  $('review-view').hidden = manager || !selectedId;
  $('swimmers-view').hidden = !manager;
  if (manager) renderRoster(); else renderReview();
}
function openManager(id = null) {
  editingId = id;
  const swimmer = swimmers.find(s => s.id === id);
  $('swimmer-form').reset(); $('form-message').textContent = '';
  $('first-name').value = swimmer?.firstName || '';
  $('last-name').value = swimmer?.lastName || '';
  $('swimmer-group').value = swimmer?.group || '';
  $('manager-title').textContent = swimmer ? 'Edit swimmer' : 'Add swimmer';
  $('save-swimmer').textContent = swimmer ? 'Save changes' : 'Save swimmer';
  $('cancel-edit').textContent = swimmer ? 'Cancel edit' : 'Clear';
  updateFormTarget();
  location.hash = 'swimmers'; showPage();
  $('first-name').focus();
}
function updateFormTarget() { $('form-target').textContent = groupTargets[$('swimmer-group').value] || ''; }
function renderRoster() {
  $('swimmer-count').textContent = String(swimmers.length);
  $('swimmer-list').innerHTML = swimmers.length ? swimmers.map(s => `<div class="swimmer-row"><div><p class="swimmer-name">${escapeHTML(fullName(s))}</p><p class="swimmer-meta">${escapeHTML(s.group)}</p></div><div class="row-actions"><button type="button" class="button secondary" data-review="${s.id}" aria-label="Review ${escapeHTML(fullName(s))}">Review</button><button type="button" class="button secondary" data-edit="${s.id}" aria-label="Edit ${escapeHTML(fullName(s))}">Edit</button><button type="button" class="button secondary delete-button" data-delete="${s.id}" aria-label="Delete ${escapeHTML(fullName(s))}">Delete</button></div></div>`).join('') : '<p class="help">No swimmers saved yet.</p>';
}
function confirm(title, message, label, action) {
  $('confirm-title').textContent = title; $('confirm-message').textContent = message;
  $('confirm-ok').textContent = label; confirmAction = action;
  $('confirm-dialog').showModal(); $('confirm-cancel').focus();
}
function expireReviews() {
  try {
    store.cleanup();
    let currentExpired = false;
    for (const [id,draft] of drafts) if (Date.now() >= draft.createdAt + RETENTION_MS) {
      drafts.delete(id); unsaved.delete(id);
      if (id === selectedId) currentExpired = true;
    }
    if (currentExpired) {
      review = store.loadReview(selectedId); drafts.set(selectedId,review);
      $('pdf-dialog').close(); renderReview();
      notice('The previous review reached its five-day limit and has been cleared. You can start a new review.');
    }
  } catch(e) { showError(e); }
}
async function generatePDF() {
  if (!current() || !review) return;
  expireReviews();
  const token = ++pdfGeneration;
  const snapshot = structuredClone(review), swimmer = {...current()};
  $('pdf-ready').hidden = true; $('pdf-message').textContent = 'Preparing your PDF…';
  if (!$('pdf-dialog').open) $('pdf-dialog').showModal();
  try {
    const { createReviewPDF } = await import('./pdf.js');
    const result = await createReviewPDF(swimmer, snapshot);
    if (token !== pdfGeneration || !$('pdf-dialog').open) return;
    if (pdfURL) URL.revokeObjectURL(pdfURL);
    pdfURL = URL.createObjectURL(result.blob);
    pdfFile = new File([result.blob],result.filename,{type:'application/pdf'});
    $('pdf-download').href = pdfURL; $('pdf-download').download = result.filename;
    $('pdf-open').href = pdfURL;
    $('pdf-filename').textContent = result.filename;
    $('pdf-message').textContent = `${fullName(swimmer)} · ${result.pages} pages · Ready to download`;
    $('pdf-share').hidden = !navigator.canShare?.({files:[pdfFile]});
    $('pdf-ready').hidden = false;
  } catch(e) { $('pdf-message').textContent = 'The PDF could not be created. Your review is still in the form. Try again, or reconnect and reload to finish downloading the app.'; }
}

$('rating-select').innerHTML = ratings.map(r => `<option value="${r.label}">${r.label}</option>`).join('');
$('swimmer-group').innerHTML = '<option value="">Choose a group…</option>' + groups.map(g => `<option value="${g}">${g}</option>`).join('');
$('rating-select').addEventListener('change', () => { answer().rating = $('rating-select').value; $('rating-meaning').textContent = ratings.find(r => r.label === $('rating-select').value).note; saveDraft(); });
$('comments').addEventListener('input', () => { if (active === 11) review.remedial = $('comments').value; else answer().comments = $('comments').value; saveDraft(); });
$('preset-select').addEventListener('change', () => {
  if ($('preset-select').value === '') return;
  const text = sections[active].presets[Number($('preset-select').value)].replaceAll('[Name]',current().firstName);
  const before = $('comments').value.trimEnd();
  const combined = before ? `${before}\n\n${text}` : text;
  if (combined.length > 12000) { notice('This comment would exceed the field limit. Shorten the existing text first.'); $('preset-select').value = ''; return; }
  answer().comments = combined; $('comments').value = combined; $('preset-select').value = '';
  saveDraft(); $('comments').focus();
});
$('review-date').addEventListener('change', () => { if (!$('review-date').validity.valid) { $('review-date').reportValidity(); return; } review.date = $('review-date').value; saveDraft(); });
$('section-nav').addEventListener('click', e => { const button = e.target.closest('[data-section]'); if (button) { active = Number(button.dataset.section); renderReview(true); } });
$('section-select').addEventListener('change', () => { active = Number($('section-select').value); renderReview(true); });
$('previous-button').addEventListener('click', () => { if (active > 0) active--; renderReview(true); });
$('next-button').addEventListener('click', () => { if (active === 11) generatePDF(); else { active++; renderReview(true); if (matchMedia('(max-width:650px)').matches) $('section-title').scrollIntoView({block:'start'}); } });
$('swimmer-select').addEventListener('change', () => { try { selectSwimmer($('swimmer-select').value); notice(''); renderReview(); } catch(e) { showError(e); } });
$('manage-button').addEventListener('click', () => openManager());
$('first-swimmer').addEventListener('click', () => openManager());
$('cancel-edit').addEventListener('click', () => openManager());
$('back-button').addEventListener('click', () => { location.hash = 'review'; showPage(); });
$('swimmer-group').addEventListener('change', updateFormTarget);
$('swimmer-form').addEventListener('submit', e => {
  e.preventDefault();
  try {
    const swimmer = store.saveSwimmer({id:editingId || crypto.randomUUID(),firstName:$('first-name').value,lastName:$('last-name').value,group:$('swimmer-group').value});
    selectedId = swimmer.id; refreshSwimmers(); selectSwimmer(swimmer.id); openManager();
    $('form-message').textContent = `${fullName(swimmer)} saved. Choose Review to start.`; clearError();
  } catch(error) { showError(error); }
});
$('swimmer-list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) openManager(b.dataset.edit);
  if (b.dataset.review) { try { selectSwimmer(b.dataset.review); location.hash = 'review'; showPage(); } catch(error) { showError(error); } }
  if (b.dataset.delete) {
    const swimmer = swimmers.find(s => s.id === b.dataset.delete);
    confirm('Delete swimmer?',`${fullName(swimmer)} and their saved review will be removed from this device.`, 'Delete swimmer', () => {
      store.deleteSwimmer(swimmer.id); drafts.delete(swimmer.id); unsaved.delete(swimmer.id);
      refreshSwimmers(); if (selectedId) selectSwimmer(selectedId); else review = null;
      openManager(); notice(`${fullName(swimmer)} deleted.`);
    });
  }
});
$('clear-review').addEventListener('click', () => confirm('Clear this review?',`The ratings and comments for ${fullName(current())} will be removed. Their name and group will stay saved.`, 'Clear review', () => {
  store.clearReview(selectedId); unsaved.delete(selectedId); review = blankReview(selectedId); drafts.set(selectedId,review); active = 0; renderReview(); notice('Review cleared.');
}));
$('confirm-ok').addEventListener('click', () => { try { confirmAction?.(); $('confirm-dialog').close(); clearError(); } catch(e) { $('confirm-dialog').close(); showError(e); } });
$('confirm-cancel').addEventListener('click', () => $('confirm-dialog').close());
$('confirm-dialog').addEventListener('close', () => { confirmAction = null; });
$('reload-review').addEventListener('click', () => confirm('Reopen saved review?','Any changes in this window that could not be saved will be replaced by the saved review. Download a PDF first if you need to keep this draft.', 'Reopen review', () => {
  drafts.delete(selectedId); unsaved.delete(selectedId); selectSwimmer(selectedId); renderReview(); clearError();
}));
$('pdf-button').addEventListener('click', generatePDF);
$('pdf-close').addEventListener('click', () => $('pdf-dialog').close());
$('pdf-dialog').addEventListener('close', () => { pdfGeneration++; if (pdfURL) URL.revokeObjectURL(pdfURL); pdfURL = null; pdfFile = null; });
$('pdf-share').addEventListener('click', async () => { try { await navigator.share({files:[pdfFile],title:'Aquabears Swimmer Development Review'}); } catch(e) { if(e.name !== 'AbortError') $('pdf-message').textContent = 'Sharing is unavailable here. Use Download PDF instead.'; } });
window.addEventListener('hashchange', showPage);
window.addEventListener('beforeunload', e => { if (unsaved.size) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('storage', e => {
  if (e.key === ROSTER_KEY) {
    try { const oldId = selectedId; refreshSwimmers(); if (selectedId !== oldId) { drafts.delete(oldId); unsaved.delete(oldId); if (selectedId) selectSwimmer(selectedId); else review = null; } showPage(); } catch(error) { showError(error); }
  } else if (e.key === REVIEW_PREFIX + selectedId && !unsaved.has(selectedId)) {
    try { drafts.delete(selectedId); review = store.loadReview(selectedId); drafts.set(selectedId, review); renderReview(); notice('Review refreshed from another window.'); } catch(error) { showError(error); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { expireReviews(); swRegistration?.update().catch(()=>{}); } });
setInterval(expireReviews, 60_000);

function isInstalled() { return matchMedia('(display-mode:standalone)').matches || navigator.standalone === true; }
function connectionStatus() {
  const ready = Boolean(navigator.serviceWorker?.controller);
  $('offline-status').textContent = ready ? (navigator.onLine ? 'Offline ready' : 'Working offline') : 'Preparing offline use…';
  $('offline-status').classList.toggle('ready', ready);
  $('install-button').hidden = isInstalled();
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('install-button').hidden = false; });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('install-button').hidden = true; notice('Aquabears Review installed.'); });
$('install-button').addEventListener('click', async () => {
  if (deferredInstall) { const prompt = deferredInstall; deferredInstall = null; await prompt.prompt(); await prompt.userChoice; return; }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('install-instructions').innerHTML = ios ? '<ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Keep “Open as Web App” on if shown, then tap Add.</li></ol>' : '<ol><li>Open this page in Chrome.</li><li>Open the browser menu and choose Install app.</li><li>Open Aquabears Review from your apps.</li></ol><p class="help">If Install app is not available, wait for Offline ready and reload the page while online.</p>';
  $('install-dialog').showModal();
});
$('install-close').addEventListener('click', () => $('install-dialog').close());
$('update-button').addEventListener('click', () => {
  if (unsaved.size) { notice('Download your unsaved review PDF before applying the update.'); return; }
  if (swRegistration?.waiting) { applyingUpdate = true; swRegistration.waiting.postMessage({type:'SKIP_WAITING'}); }
});
async function setupOffline() {
  if (!('serviceWorker' in navigator)) { $('offline-status').textContent = 'Offline use unavailable in this browser'; return; }
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const updateNotice = () => { $('update-button').hidden = !(swRegistration.waiting && navigator.serviceWorker.controller); };
    updateNotice();
    const watchInstall = worker => worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') { updateNotice(); connectionStatus(); }
      if (worker.state === 'redundant' && !navigator.serviceWorker.controller) $('offline-status').textContent = 'Offline setup incomplete · reconnect and reload';
    });
    watchInstall(swRegistration.installing);
    swRegistration.addEventListener('updatefound', () => watchInstall(swRegistration.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (applyingUpdate) location.reload(); else connectionStatus(); });
    await navigator.serviceWorker.ready; connectionStatus(); updateNotice();
  } catch { $('offline-status').textContent = 'Offline setup incomplete · reconnect and reload'; }
}
window.addEventListener('online', connectionStatus); window.addEventListener('offline', connectionStatus);
try {
  store = createStore(localStorage); store.cleanup(); refreshSwimmers();
  if (selectedId) selectSwimmer(selectedId);
  showPage();
} catch(e) { showError(e); $('empty-view').hidden = false; }
setupOffline();
