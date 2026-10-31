import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeStore } from '../src/native-storage.js';
import { newVisit, newNote, updateNote, clientReport } from '../src/model.js';

function bridge() {
  let saved = { version: 0, settings: null, visits: [] };
  let fail = false;
  return {
    async readRecords() { return structuredClone(saved); },
    async writeRecords(data) {
      if (fail) throw new Error('nativeFailed');
      if (saved.version !== data.expectedVersion) throw new Error('conflict');
      saved = structuredClone({ version: saved.version + 1, settings: data.settings, visits: data.visits });
    },
    failWrites() { fail = true; },
  };
}
const settings = { language: 'tr', trialStartedAt: new Date().toISOString(), lastBackupAt: null };

test('native adapter persists settings/records across instances, backup/erase/restore and privacy projection', async () => {
  const native = bridge();
  const store = await new NativeStore(native).open();
  await store.saveSettings(settings);
  const visit = newVisit('Synthetic İstanbul Łódź Brașov');
  visit.notes.push(newNote('PRIVATE ORIGINAL'));
  visit.notes.push(updateNote(newNote('Public'), 'Public', 'completed', 'client'));
  await store.saveVisit(visit);
  const reopened = await new NativeStore(native).open();
  assert.deepEqual(await reopened.settings(), settings);
  assert.deepEqual(await reopened.visits(), [visit]);
  assert(!JSON.stringify(clientReport((await reopened.visits())[0], 'tr')).includes('PRIVATE'));
  const backup = await reopened.backup();
  await reopened.erase();
  assert.deepEqual(await reopened.visits(), []);
  await reopened.restore(backup);
  assert.deepEqual(await reopened.visits(), [visit]);
  assert.deepEqual(await reopened.settings(), settings);
});

test('native adapter rejects stale creates, edits/deletes and invalid restores without changing data', async () => {
  const native = bridge();
  const store = await new NativeStore(native).open();
  await store.saveSettings(settings);
  const visit = newVisit('Synthetic revision');
  await store.saveVisit(visit);
  await assert.rejects(store.saveVisit(visit), /conflict/);
  const edited = { ...visit, reference: 'Saved edit', revision: 2 };
  await store.saveVisit(edited, 1);
  await assert.rejects(store.saveVisit({ ...visit, reference: 'stale edit' }, 1), /conflict/);
  await assert.rejects(store.deleteVisit(visit), /conflict/);
  await assert.rejects(store.restore({ visits: [] }), /invalidBackup/);
  assert.deepEqual(await store.visits(), [edited]);
  await store.deleteVisit(edited);
  assert.deepEqual(await store.visits(), []);
});

test('native snapshot CAS prevents concurrent replacement; disk failures never look saved', async () => {
  const native = bridge();
  const a = new NativeStore(native);
  const b = new NativeStore(native);
  const results = await Promise.allSettled([a.saveVisit(newVisit('A')), b.saveVisit(newVisit('B'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.message === 'conflict').length, 1);
  const before = await native.readRecords();
  native.failWrites();
  await assert.rejects(a.erase(), /nativeFailed/);
  assert.deepEqual(await native.readRecords(), before);
});
