import { LANGUAGES, LANGUAGE_NAMES, CATEGORIES, LIMITS, newVisit, newNote, updateNote, clientReport, trialStatus } from './model.js';
import { translator } from './i18n.js';
import { LocalStore } from './storage.js';
import { importPhoto } from './photos.js';
import { renderReport } from './pdf.js';

const root = document.querySelector('#app');
const store = new LocalStore();
const state = { settings: null, visits: [], visit: null, screen: 'home', dirty: false, busy: false, pdf: null, report: null, offline: 'offlinePending', storageStatus: 'persistenceUnknown', usage: null };
let t = translator('en');
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const date = value => new Intl.DateTimeFormat(state.settings?.language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const button = (text, attrs = '', kind = 'secondary') => `<button class="${kind}" ${attrs}>${escape(text)}</button>`;
const label = (key, control) => `<label>${escape(t(key))}${control}</label>`;
const languages = language => `<select name="language" id="language">${LANGUAGES.map(code => `<option value="${code}" ${code === language ? 'selected' : ''}>${escape(LANGUAGE_NAMES[code])}</option>`).join('')}</select>`;
const categories = (name, value) => `<select name="${name}">${CATEGORIES.map(code => `<option value="${code}" ${code === value ? 'selected' : ''}>${escape(t(code))}</option>`).join('')}</select>`;
const visible = (name, value) => `<label class="visibility"><input type="checkbox" name="${name}" ${value === 'client' ? 'checked' : ''}>${escape(t('clientVisible'))}</label>`;
const notice = (text, kind = '') => `<p class="notice ${kind}">${escape(text)}</p>`;

function frame(content) {
  document.documentElement.lang = state.settings?.language || document.documentElement.lang;
  root.innerHTML = `
    <header class="topbar"><a class="brand" href="#" data-route="home"><img src="/icon.svg" width="36" height="36" alt="">Arbeit<span>Mgmt</span></a>
      ${state.settings ? `<nav aria-label="${escape(t('visits'))}">${button(t('visits'), 'data-route="home"')}${button(t('settings'), 'data-route="settings"')}</nav>` : ''}
    </header>
    <div class="beta">${escape(t('beta'))}</div>
    <main id="main" tabindex="-1">${content}</main>
    <div id="feedback" role="status" aria-live="polite"></div>
    <footer><span id="offline-state">${escape(offlineLabel())}</span><span>${escape(t('tagline'))}</span></footer>`;
  root.querySelectorAll('[data-route]').forEach(element => element.addEventListener('click', event => {
    event.preventDefault();
    if (state.busy || !canLeave()) return;
    run(async () => navigate(element.dataset.route));
  }));
  root.querySelectorAll('input,textarea,select').forEach(element => element.addEventListener('input', () => {
    state.dirty = true;
    const feedbackElement = document.querySelector('#feedback');
    if (feedbackElement) { feedbackElement.textContent = ''; feedbackElement.className = ''; }
    const saved = document.querySelector('.saved');
    if (saved) saved.textContent = t('save');
  }));
}

function feedback(message, error = false) {
  const element = document.querySelector('#feedback');
  if (!element) return;
  element.textContent = message;
  element.className = error ? 'feedback error' : 'feedback';
  element.setAttribute('role', error ? 'alert' : 'status');
}

async function run(action, form) {
  if (state.busy) return;
  state.busy = true;
  const buttons = form ? [...form.querySelectorAll('button')] : [];
  buttons.forEach(b => { b.disabled = true; });
  root.setAttribute('aria-busy', 'true');
  try { await action(); }
  catch (error) {
    console.error('ArbeitMgmt action failed:', error.name, error.message);
    const known = ['invalidReference', 'invalidNote', 'invalidPhoto', 'invalidBackup', 'limitReached', 'conflict', 'databaseBlocked', 'storageUnavailable', 'pdfFailed'];
    feedback(t(known.includes(error.message) ? error.message : 'saveFailed'), true);
  } finally {
    state.busy = false;
    buttons.forEach(b => { b.disabled = false; });
    root.removeAttribute('aria-busy');
  }
}

function canLeave() { return !state.dirty || confirm(t('unsaved')); }
async function navigate(screen) {
  const visits = screen === 'home' ? await store.visits() : null;
  state.dirty = false;
  state.pdf = null;
  state.report = null;
  state.screen = screen;
  if (screen === 'home') { state.visit = null; state.visits = visits; home(); }
  else if (screen === 'settings') await settingsScreen();
  document.querySelector('#main')?.focus();
}

function setup(language = 'en') {
  t = translator(language);
  document.documentElement.lang = language;
  frame(`<section class="setup"><div class="eyebrow">QUICK VISIT REPORT</div><h1>${escape(t('setupTitle'))}</h1><p class="lead">${escape(t('setupBody'))}</p>
    <form id="setup">${label('language', languages(language))}<p class="hint">${escape(t('languageHelp'))}</p>
    ${notice(t('localWarning'))}${notice(t('trialTerms'))}
    ${button(t('start'), 'type="submit"', 'primary')}</form>
    <details><summary>${escape(t('privacy'))}</summary><p>${escape(t('privacyText'))}</p><p>${escape(t('legalText'))}</p></details></section>`);
  document.querySelector('#language').addEventListener('change', event => { state.dirty = false; setup(event.target.value); });
  document.querySelector('#setup').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const settings = { language, trialStartedAt: new Date().toISOString(), lastBackupAt: null };
      await store.saveSettings(settings);
      state.settings = settings;
      await navigate('home');
    }, event.target);
  });
}

function home() {
  const trial = trialStatus(state.settings.trialStartedAt);
  const total = state.visits.length;
  frame(`<section class="page-heading"><div><p class="eyebrow">QUICK VISIT REPORT</p><h1>${escape(t('visits'))}</h1><p>${total} ${escape(t('recordCount').toLocaleLowerCase(state.settings.language))} · ${escape(trial.active ? `${t('trialActive')}: ${trial.daysLeft}` : t('trialExpired'))}</p></div>
    ${button(t('newVisit'), `id="new-visit" ${trial.active ? '' : 'disabled'}`, 'primary')}</section>
    ${notice(t('localWarning'))}
    <section class="visit-list">${total ? state.visits.map(v => {
      const items = [...v.notes, ...v.photos];
      return `<button class="visit-card" data-visit="${v.id}"><span class="visit-icon" aria-hidden="true">↗</span><span><strong>${escape(v.reference)}</strong><small>${escape(v.client || v.site || date(v.createdAt))}</small><small>${escape(t('updated'))}: ${escape(date(v.updatedAt))} · ${escape(t('revision'))} ${v.revision}</small></span><span class="counts">${items.filter(n => n.visibility === 'client').length} ${escape(t('includedCount'))}</span></button>`;
    }).join('') : `<div class="empty"><div class="empty-mark" aria-hidden="true">✓</div><h2>${escape(t('emptyTitle'))}</h2><p>${escape(t('emptyBody'))}</p></div>`}</section>`);
  document.querySelector('#new-visit').addEventListener('click', () => { if (!state.busy) createScreen(); });
  root.querySelectorAll('[data-visit]').forEach(element => element.addEventListener('click', () => run(async () => {
    const latest = await store.visits();
    state.visit = latest.find(v => v.id === element.dataset.visit);
    if (!state.visit) throw new Error('conflict');
    state.screen = 'edit'; state.dirty = false;
    editScreen(); document.querySelector('#main').focus();
  })));
}

function createScreen() {
  if (!trialStatus(state.settings.trialStartedAt).active) { feedback(t('trialExpired'), true); return; }
  state.screen = 'create';
  frame(`<section class="narrow"><h1>${escape(t('newVisit'))}</h1><form id="create-visit">
    ${label('reference', `<input name="reference" maxlength="120" required placeholder="${escape(t('referenceHint'))}" autocomplete="off">`)}
    ${label('client', '<input name="client" maxlength="200" autocomplete="off">')}
    ${label('site', '<input name="site" maxlength="300" autocomplete="off">')}
    <div class="actions">${button(t('create'), 'type="submit"', 'primary')}${button(t('cancel'), 'type="button" data-route="home"')}</div>
    </form></section>`);
  document.querySelector('#create-visit').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      if (!trialStatus(state.settings.trialStartedAt).active) throw new Error('limitReached');
      const data = new FormData(event.target);
      const visit = newVisit(data.get('reference'), { client: data.get('client'), site: data.get('site') });
      await store.saveVisit(visit);
      state.visit = visit; state.screen = 'edit'; state.dirty = false;
      editScreen();
    }, event.target);
  });
  document.querySelector('input[name="reference"]').focus();
}

function history(note) {
  return `<details class="history"><summary>${escape(t('original'))}</summary><p class="preserve">${escape(note.originalText)}</p><p>${escape(date(note.createdAt))}</p>
    ${note.history.length ? note.history.map(h => `<div class="history-entry"><small>${escape(date(h.at))} · ${escape(t(h.category))} · ${escape(t(h.visibility === 'client' ? 'clientVisible' : 'internal'))}</small><p class="preserve">${escape(h.text)}</p></div>`).join('') : `<p>${escape(t('historyEmpty'))}</p>`}</details>`;
}

function editScreen() {
  const v = state.visit;
  const items = [...v.notes, ...v.photos];
  frame(`${button(t('back'), 'data-route="home"', 'text-button')}<section class="page-heading"><div><h1>${escape(v.reference)}</h1><p>${escape(t('revision'))} ${v.revision} · ${escape(t('updated'))}: ${escape(date(v.updatedAt))}</p></div><span class="saved">${escape(t('saved'))}</span></section>
    <div class="metrics"><span>${items.filter(i => i.visibility === 'internal').length} ${escape(t('privateCount'))}</span><span>${items.filter(i => i.visibility === 'client').length} ${escape(t('includedCount'))}</span></div>
    <form id="edit-visit"><section class="card metadata">
      ${label('reference', `<input name="reference" maxlength="120" required value="${escape(v.reference)}">`)}
      ${label('client', `<input name="client" maxlength="200" value="${escape(v.client)}">`)}
      ${label('site', `<input name="site" maxlength="300" value="${escape(v.site)}">`)}
    </section>
    ${notice(t('noteHint'))}
    <section><h2>${escape(t('note'))} <span class="muted">${v.notes.length}/${LIMITS.items}</span></h2>
      ${v.notes.length ? v.notes.map(n => `<article class="card item">
        <div class="item-top"><span class="badge ${n.visibility === 'client' ? 'included' : ''}">${escape(t(n.visibility === 'client' ? 'clientVisible' : 'internal'))}</span>
          ${button(t('remove'), `type="submit" name="intent" value="remove-note:${n.id}"`, 'text-button danger')}</div>
        ${label('note', `<textarea name="note-${n.id}" maxlength="${LIMITS.text}" required rows="3">${escape(n.text)}</textarea>`)}
        ${label('category', categories(`category-${n.id}`, n.category))}
        ${visible(`visible-${n.id}`, n.visibility)}${history(n)}
      </article>`).join('') : `<p class="muted">${escape(t('noNotes'))}</p>`}
      <article class="card add-note">${label('note', `<textarea name="new-note" maxlength="${LIMITS.text}" rows="3" placeholder="${escape(t('addNote'))}"></textarea>`)}
        ${label('category', categories('new-category', 'completed'))}
        ${button(t('addNote'), `type="submit" name="intent" value="add-note" ${v.notes.length >= LIMITS.items ? 'disabled' : ''}`)}
      </article>
    </section>
    <section><h2>${escape(t('photos'))} <span class="muted">${v.photos.length}/${LIMITS.items}</span></h2><p class="hint">${escape(t('photoHelp'))}</p>
      <div class="photo-grid">${v.photos.map(p => `<article class="card item photo-card">
        <img src="${p.reportImage}" alt="${escape(p.caption || t('photos'))}" loading="lazy">
        <span class="badge ${p.visibility === 'client' ? 'included' : ''}">${escape(t(p.visibility === 'client' ? 'clientVisible' : 'internal'))}</span>
        ${label('caption', `<textarea name="caption-${p.id}" maxlength="1000" rows="2">${escape(p.caption)}</textarea>`)}
        ${visible(`visible-${p.id}`, p.visibility)}
        <details class="history"><summary>${escape(t('original'))}</summary><p>${escape(p.originalName)} · ${escape(date(p.createdAt))}</p><a download="${escape(p.originalName)}" href="${p.originalData}">${escape(p.originalName)}</a>
          ${p.history.map(h => `<p class="preserve">${escape(date(h.at))} · ${escape(t(h.visibility === 'client' ? 'clientVisible' : 'internal'))}<br>${escape(h.caption)}</p>`).join('')}</details>
        ${button(t('remove'), `type="submit" name="intent" value="remove-photo:${p.id}"`, 'text-button danger')}
      </article>`).join('')}</div>
      ${!v.photos.length ? `<p class="muted">${escape(t('noPhotos'))}</p>` : ''}
      <div class="card">${label('addPhoto', '<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>')}
        ${label('capturePhoto', '<input name="camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">')}</div>
    </section>
    <div class="sticky-actions">${button(t('save'), 'type="submit" name="intent" value="save"')}${button(t('preview'), 'type="submit" name="intent" value="preview"', 'primary')}</div>
    </form><div class="bottom-actions">${button(t('deleteVisit'), 'id="delete-visit"', 'text-button danger')}</div>`);
  document.querySelector('#edit-visit').addEventListener('submit', event => {
    event.preventDefault();
    const intent = event.submitter?.value || 'save';
    run(async () => {
      if (intent.startsWith('remove-') && !confirm(t('removeConfirm'))) return;
      await saveEditor(event.target, intent);
      editScreen();
      if (intent === 'preview') await previewScreen();
      else feedback(t('saved'));
    }, event.target);
  });
  document.querySelector('#delete-visit').addEventListener('click', () => {
    if (!confirm(t('deleteConfirm'))) return;
    run(async () => { await store.deleteVisit(v); await navigate('home'); });
  });
}

async function saveEditor(form, intent) {
  const data = new FormData(form);
  const original = state.visit;
  const updated = structuredClone(original);
  const now = new Date().toISOString();
  const fields = newVisit(data.get('reference'), { client: data.get('client'), site: data.get('site') });
  updated.reference = fields.reference; updated.client = fields.client; updated.site = fields.site;
  updated.notes = updated.notes.filter(n => intent !== `remove-note:${n.id}`).map(n => updateNote(n, data.get(`note-${n.id}`), data.get(`category-${n.id}`), data.has(`visible-${n.id}`) ? 'client' : 'internal', now));
  updated.photos = updated.photos.filter(p => intent !== `remove-photo:${p.id}`).map(p => {
    const caption = data.get(`caption-${p.id}`).trim();
    const visibility = data.has(`visible-${p.id}`) ? 'client' : 'internal';
    if (p.caption === caption && p.visibility === visibility) return p;
    if (p.history.length >= 1000) throw new Error('limitReached');
    return { ...p, caption, visibility, updatedAt: now, history: [...p.history, { caption: p.caption, visibility: p.visibility, at: p.updatedAt }] };
  });
  const text = data.get('new-note');
  if (text.trim() || intent === 'add-note') updated.notes.push(newNote(text, data.get('new-category'), now));
  const files = [...data.getAll('photos'), ...data.getAll('camera')].filter(f => f.size > 0);
  if (updated.notes.length > LIMITS.items || updated.photos.length + files.length > LIMITS.items) throw new Error('limitReached');
  for (const file of files) updated.photos.push(await importPhoto(file));
  if (JSON.stringify(updated) !== JSON.stringify(original)) {
    updated.updatedAt = new Date().toISOString(); updated.revision += 1;
    await store.saveVisit(updated, original.revision);
    state.visit = updated;
  }
  state.dirty = false;
}

async function previewScreen() {
  state.report = clientReport(state.visit, state.settings.language);
  try { state.pdf = await renderReport(state.report); }
  catch (error) { console.error('PDF rendering failed:', error.name, error.message); throw new Error('pdfFailed'); }
  state.screen = 'preview';
  const report = state.report;
  const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile()] });
  frame(`${button(t('back'), 'id="back-editor"', 'text-button')}<h1>${escape(t('previewTitle'))}</h1>${notice(t('previewHelp'))}
    ${!report.notes.length && !report.photos.length ? notice(t('noIncluded')) : ''}
    <div class="actions">${button(t('downloadPdf'), 'id="download-pdf"', 'primary')}${button(t('sharePdf'), `id="share-pdf" ${canShare ? '' : 'disabled'}`)}</div>
    ${!canShare ? `<p class="hint">${escape(t('shareUnsupported'))}</p>` : ''}
    <p class="hint">${escape(t('pdfHelp'))}</p>
    <section class="preview-pages">${state.pdf.pages.map((page, i) => `<img class="pdf-page" src="${page}" alt="${escape(t('page'))} ${i + 1}">`).join('')}</section>
    <details><summary>${escape(t('textReport'))}</summary><div class="transcript"><h2>${escape(report.reference)}</h2><p>${escape(report.client)}<br>${escape(report.site)}</p>
      <p>${escape(t('created'))}: ${escape(date(report.createdAt))}<br>${escape(t('updated'))}: ${escape(date(report.updatedAt))} · ${escape(t('revision'))} ${report.revision}</p>
      ${CATEGORIES.map(c => report.notes.some(n => n.category === c) ? `<h3>${escape(t(c))}</h3>${report.notes.filter(n => n.category === c).map(n => `<p class="preserve">${escape(n.text)}</p>`).join('')}` : '').join('')}
      ${report.photos.map(p => `<figure><img src="${p.image}" alt="${escape(p.caption || t('photos'))}"><figcaption>${escape(p.caption)}</figcaption></figure>`).join('')}<p>${escape(t('reportDisclaimer'))}</p></div></details>`);
  document.querySelector('#back-editor').addEventListener('click', () => { if (!state.busy) { state.pdf = null; state.report = null; state.screen = 'edit'; editScreen(); } });
  document.querySelector('#download-pdf').addEventListener('click', () => {
    download(state.pdf.blob, pdfFile().name); feedback(t('downloadStarted'));
  });
  document.querySelector('#share-pdf').addEventListener('click', () => {
    // Call directly from the gesture, not after PDF generation, to preserve transient activation.
    navigator.share({ files: [pdfFile()] }).then(() => feedback(t('shareDone'))).catch(error => {
      if (error.name === 'AbortError') feedback(t('shareCancelled'));
      else { console.error('File sharing failed:', error.name); feedback(t('shareUnsupported'), true); }
    });
  });
  document.querySelector('#main').focus();
}

function pdfFile() { return new File([state.pdf.blob], `visit-report-${state.visit.createdAt.slice(0, 10)}-r${state.visit.revision}.pdf`, { type: 'application/pdf' }); }
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function settingsScreen() {
  if (navigator.storage?.persisted) {
    state.storageStatus = await navigator.storage.persisted() ? 'persistentGranted' : 'persistenceUnknown';
  }
  if (navigator.storage?.estimate) state.usage = await navigator.storage.estimate();
  const s = state.settings;
  const trial = trialStatus(s.trialStartedAt);
  frame(`<h1>${escape(t('settings'))}</h1><section class="card"><form id="language-settings">
    ${label('language', languages(s.language))}<p class="hint">${escape(t('languageHelp'))}</p>${button(t('save'), 'type="submit"')}</form></section>
    <section class="card"><h2>${escape(t('backup'))}</h2>${notice(t('localWarning'))}<p>${escape(t('installHelp'))}</p><p>${escape(t('backupHelp'))}</p>
      ${button(t('backup'), 'id="backup"', 'primary')}<p class="hint">${escape(t('lastBackup'))}: ${escape(s.lastBackupAt ? date(s.lastBackupAt) : t('never'))}</p>
      <hr><p>${escape(t('restoreHelp'))}</p>${label('restore', '<input id="restore" type="file" accept=".json,application/json">')}
      <hr><p>${escape(t('persistenceHelp'))}</p>${button(t('persistence'), `id="persistence" ${navigator.storage?.persist ? '' : 'disabled'}`)}
      <p id="storage-status" class="hint">${escape(t(state.storageStatus))}</p>
      ${state.usage ? `<p class="hint">${escape(t('storageUsage'))}: ${(state.usage.usage / 1048576).toFixed(1)} MB / ${(state.usage.quota / 1048576).toFixed(0)} MB</p>` : ''}
    </section>
    <section class="card"><h2>${escape(t('plan'))}</h2><p>${escape(trial.active ? `${t('trialActive')}: ${trial.daysLeft}` : t('trialExpired'))}</p><p>${escape(t('trialTerms'))}</p>${notice(t('billingUnavailable'))}</section>
    <section class="card"><h2>${escape(t('privacy'))}</h2><p>${escape(t('privacyText'))}</p><p>${escape(t('legalText'))}</p></section>
    <section class="card">${button(t('erase'), 'id="erase"', 'danger secondary')}</section>`);
  document.querySelector('#language-settings').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const language = new FormData(event.target).get('language');
      if (!LANGUAGES.includes(language)) throw new Error('invalidLanguage');
      const settings = { ...s, language };
      await store.saveSettings(settings);
      state.settings = settings; state.dirty = false; t = translator(language);
      await settingsScreen(); feedback(t('saved'));
    }, event.target);
  });
  document.querySelector('#backup').addEventListener('click', () => {
    if (!canLeave()) return;
    if (!confirm(t('backupConfirm'))) return;
    run(async () => {
      const data = await store.backup(state.settings);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      if (blob.size > LIMITS.backupBytes) throw new Error('limitReached');
      download(blob, `arbeitmgmt-private-backup-${new Date().toISOString().slice(0, 10)}.json`);
      const settings = { ...state.settings, lastBackupAt: new Date().toISOString() };
      await store.saveSettings(settings); state.settings = settings; state.dirty = false;
      await settingsScreen(); feedback(t('backupReady'));
    });
  });
  document.querySelector('#restore').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm(t('restoreConfirm'))) { event.target.value = ''; return; }
    run(async () => {
      if (file.size > LIMITS.backupBytes) throw new Error('invalidBackup');
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('invalidBackup'); }
      const settings = await store.restore(data);
      state.settings = settings; t = translator(settings.language); state.dirty = false;
      await navigate('home'); feedback(t('restoreDone'));
    });
  });
  document.querySelector('#persistence').addEventListener('click', () => run(async () => {
    state.storageStatus = await navigator.storage.persist() ? 'persistentGranted' : 'persistentDenied';
    document.querySelector('#storage-status').textContent = t(state.storageStatus);
  }));
  document.querySelector('#erase').addEventListener('click', () => {
    if (!confirm(t('eraseConfirm'))) return;
    run(async () => {
      await store.erase();
      state.settings = null; state.visits = []; state.visit = null; state.dirty = false; state.pdf = null; state.report = null;
      setup();
    });
  });
}

function offlineLabel() {
  return `${navigator.onLine ? '' : `${t('offline')} · `}${t(state.offline)}`;
}
function offlineStatus() {
  const element = document.querySelector('#offline-state');
  if (element) element.textContent = offlineLabel();
}
window.addEventListener('online', offlineStatus);
window.addEventListener('offline', offlineStatus);
window.addEventListener('beforeunload', event => {
  if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; }
});

async function offlineSetup() {
  if (!('serviceWorker' in navigator)) { state.offline = 'offlineFailed'; offlineStatus(); return; }
  const timer = setTimeout(() => {
    if (state.offline === 'offlinePending') {
      state.offline = 'offlineFailed'; offlineStatus();
      console.error('Offline setup timed out: cache readiness was not confirmed.');
    }
  }, 15000);
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'offline-ready') {
      clearTimeout(timer);
      state.offline = event.data.ready ? 'offlineReady' : 'offlineFailed'; offlineStatus();
    }
  });
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    registration.active.postMessage('offline-ready');
  } catch (error) {
    clearTimeout(timer);
    console.error('Offline setup failed:', error.name, error.message);
    state.offline = 'offlineFailed'; offlineStatus();
  }
}

frame(`<p>${escape(t('loading'))}</p>`);
try {
  await store.open();
  state.settings = await store.settings();
  if (state.settings) { t = translator(state.settings.language); await navigate('home'); }
  else setup();
  void offlineSetup();
} catch (error) {
  console.error('Unable to open local records:', error.name, error.message);
  frame(`<h1>${escape(t('storageUnavailable'))}</h1>${notice(t(error.message === 'databaseBlocked' ? 'databaseBlocked' : 'error'))}${button(t('reload'), 'id="reload"')}`);
  document.querySelector('#reload').addEventListener('click', () => location.reload());
}
