import { LIMITS, validateBackup } from './model.js';

export class LocalStore {
  constructor(name = 'arbeitmgmt-v1') { this.name = name; this.db = null; }

  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('visits', { keyPath: 'id' });
        request.result.createObjectStore('settings');
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('databaseBlocked'));
      request.onsuccess = () => resolve(request.result);
    });
    this.db.onversionchange = () => { this.db.close(); this.db = null; };
    return this;
  }

  transact(stores, mode, action) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('storageUnavailable')); return; }
      const transaction = this.db.transaction(stores, mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('saveFailed'));
      transaction.onabort = () => reject(transaction.error || new Error('saveFailed'));
      try { result = action(transaction); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }

  async settings() {
    let request;
    await this.transact(['settings'], 'readonly', tx => { request = tx.objectStore('settings').get('profile'); });
    return request.result || null;
  }

  async saveSettings(settings) {
    await this.transact(['settings'], 'readwrite', tx => tx.objectStore('settings').put(settings, 'profile'));
  }

  async visits() {
    let request;
    await this.transact(['visits'], 'readonly', tx => { request = tx.objectStore('visits').getAll(); });
    return request.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveVisit(visit, expectedRevision = null) {
    let conflict = false;
    let limit = false;
    await this.transact(['visits'], 'readwrite', tx => {
      const store = tx.objectStore('visits');
      const read = store.getAll();
      read.onsuccess = () => {
        const existing = read.result.find(v => v.id === visit.id);
        if ((expectedRevision === null && existing) || (expectedRevision !== null && existing?.revision !== expectedRevision)) {
          conflict = true;
          tx.abort();
          return;
        }
        const records = [...read.result.filter(v => v.id !== visit.id), visit];
        if (records.length > LIMITS.visits || new TextEncoder().encode(JSON.stringify(records)).length > LIMITS.recordsBytes) {
          limit = true; tx.abort(); return;
        }
        store.put(visit);
      };
    }).catch(error => {
      if (conflict) throw new Error('conflict');
      if (limit) throw new Error('limitReached');
      throw error;
    });
  }

  async backup(settings) {
    return { format: 'arbeitmgmt-backup', version: 1, exportedAt: new Date().toISOString(), settings, visits: await this.visits() };
  }

  async deleteVisit(visit) {
    let conflict = false;
    await this.transact(['visits'], 'readwrite', tx => {
      const store = tx.objectStore('visits');
      const read = store.get(visit.id);
      read.onsuccess = () => {
        if (read.result?.revision !== visit.revision) { conflict = true; tx.abort(); }
        else store.delete(visit.id);
      };
    }).catch(error => {
      if (conflict) throw new Error('conflict');
      throw error;
    });
  }

  async restore(input) {
    const data = validateBackup(input);
    await this.transact(['visits', 'settings'], 'readwrite', tx => {
      const store = tx.objectStore('visits');
      store.clear();
      data.visits.forEach(visit => store.put(visit));
      tx.objectStore('settings').put(data.settings, 'profile');
    });
    return data.settings;
  }

  async erase() {
    await this.transact(['visits', 'settings'], 'readwrite', tx => {
      tx.objectStore('visits').clear();
      tx.objectStore('settings').clear();
    });
  }
}
