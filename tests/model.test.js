import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, CATEGORIES, newVisit, newNote, updateNote, clientReport, trialStatus, validateBackup } from '../src/model.js';
import { messages, translator } from '../src/i18n.js';
import { encodePdf } from '../src/pdf.js';

const now = '2026-10-27T10:00:00.000Z';
const settings = { language: 'en', trialStartedAt: now, lastBackupAt: null };
function backup(visit = newVisit('Synthetic garden', {}, now)) {
  return { format: 'arbeitmgmt-backup', version: 1, exportedAt: now, settings, visits: [visit] };
}

test('new capture is private; edits preserve original and prior visibility', () => {
  const original = newNote('Original private cost €42', 'completed', now);
  assert.equal(original.visibility, 'internal');
  const edit = updateNote(original, 'Garden cleaned', 'observations', 'client', '2026-10-28T10:00:00Z');
  assert.equal(edit.originalText, 'Original private cost €42');
  assert.equal(edit.history[0].text, original.text);
  assert.equal(edit.history[0].visibility, 'internal');
  assert.equal(original.history.length, 0);
  assert.equal(updateNote(edit, edit.text, edit.category, edit.visibility), edit);
});

test('report allowlist excludes internal items, originals, names and revision histories', () => {
  const visit = newVisit('Synthetic job', { client: 'Synthetic client', site: 'Synthetic site' }, now);
  const internal = newNote('NEVER_EXPORT_PRIVATE_NOTE', 'outstanding', now);
  const visible = updateNote(newNote('NEVER_EXPORT_OLD_TEXT', 'completed', now), 'Client-visible work', 'completed', 'client');
  visit.notes.push(internal, visible);
  visit.photos.push(
    { visibility: 'internal', reportImage: 'PRIVATE_IMAGE', caption: 'PRIVATE_CAPTION' },
    { visibility: 'client', reportImage: 'PUBLIC_IMAGE', caption: 'Visible caption', originalData: 'PRIVATE_ORIGINAL', originalName: 'PRIVATE_NAME', history: ['PRIVATE_HISTORY'] },
    { visibility: undefined, reportImage: 'PRIVATE_MISSING_FLAG' },
  );
  const report = clientReport(visit, 'pl');
  assert.equal(report.notes.length, 1);
  assert.deepEqual(report.photos, [{ image: 'PUBLIC_IMAGE', caption: 'Visible caption' }]);
  assert(!JSON.stringify(report).includes('PRIVATE'));
  assert(!JSON.stringify(report).includes('NEVER_EXPORT'));
  assert(!('id' in report));
  assert.equal(visit.notes[0].text, 'NEVER_EXPORT_PRIVATE_NOTE');
});

test('trial is exactly 14 days with no entitlement/unlock state', () => {
  const start = Date.parse(now);
  assert.equal(trialStatus(now, start).daysLeft, 14);
  assert.equal(trialStatus(now, start + 14 * 86400000 - 1).active, true);
  assert.equal(trialStatus(now, start + 14 * 86400000).active, false);
  assert.equal(trialStatus(now, start - 1).active, false);
  assert.throws(() => trialStatus('bad'), /invalidBackup/);
});

test('five complete UI/template languages with Polish, Turkish and Romanian Unicode', () => {
  assert.equal(LANGUAGES.length, 5);
  const keys = Object.keys(messages.en).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(messages[language]).sort(), keys, language);
    for (const key of keys) assert.equal(typeof translator(language)(key), 'string');
    for (const category of CATEGORIES) assert(translator(language)(category));
  }
  assert(messages.pl.language.includes('ę'));
  assert(messages.tr.language.includes('ü'));
  assert(messages.ro.language.includes('ț'));
  assert.throws(() => translator('xx'), /invalidLanguage/);
  assert.throws(() => translator('en')('absent'), /Missing translation/);
});

test('valid backup roundtrips originals and Unicode, drops unrecognised properties', () => {
  const visit = newVisit('Łódź · İstanbul · Österreich · Brașov', {}, now);
  visit.notes.push(updateNote(newNote('Original', 'completed', now), 'Ö ä ß Ł ą ę ş ı İ ț ă â', 'completed', 'client'));
  const input = backup(visit);
  input.settings.fakePaid = true;
  input.visits[0].untrusted = 'drop';
  const restored = validateBackup(JSON.parse(JSON.stringify(input)));
  assert.equal(restored.visits[0].notes[0].originalText, 'Original');
  assert(!('untrusted' in restored.visits[0]));
  assert(!('fakePaid' in restored.settings));
  assert.equal(restored.visits[0].notes[0].text, visit.notes[0].text);
});

test('invalid backups reject before storage replacement', () => {
  const cases = [null, {}, { ...backup(), version: 2 }];
  const duplicate = backup(); duplicate.visits.push(duplicate.visits[0]); cases.push(duplicate);
  const badDate = backup(); badDate.visits[0].createdAt = 'not-a-date'; cases.push(badDate);
  const badNote = backup(); badNote.visits[0].notes.push(null); cases.push(badNote);
  const badFlag = backup(); badFlag.visits[0].notes.push({ ...newNote('a'), visibility: 'unknown' }); cases.push(badFlag);
  const badPhoto = backup(); badPhoto.visits[0].photos.push({ reportImage: 'javascript:alert(1)' }); cases.push(badPhoto);
  for (const input of cases) assert.throws(() => validateBackup(input), /invalidBackup/);
});

test('bounds and category validation', () => {
  assert.throws(() => newVisit('  '), /invalidReference/);
  assert.throws(() => newVisit('a'.repeat(121)), /invalidReference/);
  assert.throws(() => newNote(''), /invalidNote/);
  assert.throws(() => newNote('a'.repeat(6001)), /invalidNote/);
  assert.throws(() => newNote('a', 'unknown'), /invalidNote/);
  assert.throws(() => updateNote(newNote('a'), 'b', 'completed', 'unknown'), /invalidNote/);
  assert.throws(() => clientReport(newVisit('a'), 'unknown'), /invalidLanguage/);
  const atLimit = { ...newNote('At limit'), history: Array(1000).fill({}) };
  assert.equal(updateNote(atLimit, atLimit.text, atLimit.category, atLimit.visibility), atLimit);
  assert.throws(() => updateNote(atLimit, 'Another change', atLimit.category, atLimit.visibility), /limitReached/);
});

test('imported note and photo IDs cannot alias a visibility checkbox', () => {
  const input = backup();
  const note = newNote('Must remain private', 'completed', now);
  input.visits[0].notes.push(note);
  input.visits[0].photos.push({
    id: note.id, reportImage: 'data:image/jpeg;base64,/9j/2Q==', originalData: 'data:image/jpeg;base64,/9j/2Q==',
    originalName: 'synthetic.jpg', originalType: 'image/jpeg', caption: 'a',
    visibility: 'client', createdAt: now, updatedAt: now, history: [],
  });
  assert.throws(() => validateBackup(input), /invalidBackup/);
});

test('PDF offsets and stream lengths are byte-exact and metadata-free', async () => {
  const image = 'data:image/jpeg;base64,/9j/2Q==';
  const blob = encodePdf([image, image]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert(text.startsWith('%PDF-1.4'));
  assert(text.includes('/Count 2'));
  for (const forbidden of ['/EmbeddedFiles', '/Metadata', '/Info', '/JavaScript', '/Annots']) assert(!text.includes(forbidden));
  const offset = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(bytes.slice(offset, offset + 4)), 'xref');
  const xref = text.slice(text.indexOf('xref\n')).split('\n');
  for (let i = 1; i <= 8; i++) {
    const at = Number(xref[i + 2].slice(0, 10));
    assert(new TextDecoder().decode(bytes.slice(at, at + 20)).startsWith(`${i} 0 obj\n`));
  }
  assert.throws(() => encodePdf([]), /pdfFailed/);
  assert.throws(() => encodePdf(['data:image/svg+xml,bad']), /pdfFailed/);
});
