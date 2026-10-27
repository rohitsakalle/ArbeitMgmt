export const LANGUAGES = Object.freeze(['en', 'de-AT', 'pl', 'tr', 'ro']);
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', 'de-AT': 'Deutsch (Österreich)', pl: 'Polski', tr: 'Türkçe', ro: 'Română' });
export const CATEGORIES = Object.freeze(['completed', 'observations', 'outstanding']);
export const LIMITS = Object.freeze({ visits: 500, items: 50, text: 6000, imageBytes: 6 * 1024 * 1024, recordsBytes: 60 * 1024 * 1024, backupBytes: 80 * 1024 * 1024 });

export function newVisit(reference, fields = {}, now = new Date().toISOString()) {
  const ref = reference.trim();
  if (!ref || ref.length > 120 || (fields.client || '').length > 200 || (fields.site || '').length > 300) throw new Error('invalidReference');
  return {
    id: crypto.randomUUID(), reference: ref,
    client: (fields.client || '').trim(), site: (fields.site || '').trim(),
    createdAt: now, updatedAt: now, revision: 1, notes: [], photos: [],
  };
}

export function newNote(text, category = 'completed', now = new Date().toISOString()) {
  if (!text.trim() || text.length > LIMITS.text || !CATEGORIES.includes(category)) throw new Error('invalidNote');
  return { id: crypto.randomUUID(), text: text.trim(), originalText: text.trim(), category, visibility: 'internal', createdAt: now, updatedAt: now, history: [] };
}

export function updateNote(note, text, category, visibility, now = new Date().toISOString()) {
  if (!text.trim() || text.length > LIMITS.text || !CATEGORIES.includes(category) || !['internal', 'client'].includes(visibility)) throw new Error('invalidNote');
  if (note.text === text.trim() && note.category === category && note.visibility === visibility) return note;
  if (note.history.length >= 1000) throw new Error('limitReached');
  return {
    ...note, text: text.trim(), category, visibility, updatedAt: now,
    history: [...note.history, { text: note.text, category: note.category, visibility: note.visibility, at: note.updatedAt }],
  };
}

// Only this allowlisted projection may reach the preview/PDF renderer.
export function clientReport(visit, language) {
  if (!LANGUAGES.includes(language)) throw new Error('invalidLanguage');
  return {
    reference: visit.reference, client: visit.client, site: visit.site, language,
    createdAt: visit.createdAt, updatedAt: visit.updatedAt, revision: visit.revision,
    notes: visit.notes.filter(n => n.visibility === 'client').map(n => ({ text: n.text, category: n.category })),
    photos: visit.photos.filter(p => p.visibility === 'client').map(p => ({ image: p.reportImage, caption: p.caption })),
  };
}

export function trialStatus(startedAt, now = Date.now()) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) throw new Error('invalidBackup');
  const endsAt = start + 14 * 86400000;
  return { endsAt, daysLeft: Math.max(0, Math.ceil((endsAt - now) / 86400000)), active: now >= start && now < endsAt };
}

const invalid = () => { throw new Error('invalidBackup'); };
const string = (v, max) => { if (typeof v !== 'string' || v.length > max) invalid(); return v; };
const date = v => { if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) invalid(); return v; };
const id = v => { if (typeof v !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(v)) invalid(); return v; };
const visibility = v => { if (!['internal', 'client'].includes(v)) invalid(); return v; };
const category = v => { if (!CATEGORIES.includes(v)) invalid(); return v; };
const array = (v, max) => { if (!Array.isArray(v) || v.length > max) invalid(); return v; };
function unique(items) {
  if (new Set(items.map(item => item.id)).size !== items.length) invalid();
  return items;
}

// Reconstruct accepted fields instead of persisting arbitrary imported objects.
function parseBackup(input) {
  if (!input || input.format !== 'arbeitmgmt-backup' || input.version !== 1 || !input.settings) invalid();
  if (!LANGUAGES.includes(input.settings.language)) invalid();
  const settings = { language: input.settings.language, trialStartedAt: date(input.settings.trialStartedAt), lastBackupAt: input.settings.lastBackupAt === null ? null : date(input.settings.lastBackupAt) };
  const visits = unique(array(input.visits, LIMITS.visits).map(v => {
    if (!v || !Number.isSafeInteger(v.revision) || v.revision < 1) invalid();
    const reference = string(v.reference, 120);
    if (!reference.trim()) invalid();
    const visit = {
      id: id(v.id), reference, client: string(v.client, 200), site: string(v.site, 300),
      createdAt: date(v.createdAt), updatedAt: date(v.updatedAt), revision: v.revision,
      notes: unique(array(v.notes, LIMITS.items).map(n => ({
        id: id(n.id), text: string(n.text, LIMITS.text), originalText: string(n.originalText, LIMITS.text),
        category: category(n.category), visibility: visibility(n.visibility), createdAt: date(n.createdAt), updatedAt: date(n.updatedAt),
        history: array(n.history, 1000).map(h => ({ text: string(h.text, LIMITS.text), category: category(h.category), visibility: visibility(h.visibility), at: date(h.at) })),
      }))),
      photos: unique(array(v.photos, LIMITS.items).map(p => {
        if (typeof p.reportImage !== 'string' || p.reportImage.length > LIMITS.imageBytes * 1.4 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(p.reportImage) ||
            typeof p.originalData !== 'string' || p.originalData.length > LIMITS.imageBytes * 1.4 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.originalData)) invalid();
        return {
          id: id(p.id), reportImage: p.reportImage, originalData: p.originalData,
          originalName: string(p.originalName, 255), originalType: string(p.originalType, 30),
          caption: string(p.caption, 1000), visibility: visibility(p.visibility),
          createdAt: date(p.createdAt), updatedAt: date(p.updatedAt),
          history: array(p.history, 1000).map(h => ({ caption: string(h.caption, 1000), visibility: visibility(h.visibility), at: date(h.at) })),
        };
      })),
    };
    unique([...visit.notes, ...visit.photos]);
    return visit;
  }));
  if (new TextEncoder().encode(JSON.stringify(visits)).length > LIMITS.recordsBytes) invalid();
  return { format: 'arbeitmgmt-backup', version: 1, exportedAt: date(input.exportedAt), settings, visits };
}

export function validateBackup(input) {
  try { return parseBackup(input); }
  catch (error) {
    if (error instanceof TypeError) throw new Error('invalidBackup');
    throw error;
  }
}
