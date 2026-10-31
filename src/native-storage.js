import { LIMITS, validateBackup } from './model.js';

export class NativeStore {
  constructor(bridge) { this.bridge = bridge; }
  async open() { await this.bridge.readRecords(); return this; }
  async snapshot() { return this.bridge.readRecords(); }
  async mutate(action) {
    const data = await this.snapshot();
    action(data);
    if (data.visits.length > LIMITS.visits || new TextEncoder().encode(JSON.stringify(data.visits)).length > LIMITS.recordsBytes) {
      throw new Error('limitReached');
    }
    await this.bridge.writeRecords({ expectedVersion: data.version, settings: data.settings, visits: data.visits });
  }
  async settings() { return (await this.snapshot()).settings; }
  async visits() { return (await this.snapshot()).visits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async saveSettings(settings) { await this.mutate(data => { data.settings = settings; }); }
  async saveVisit(visit, expectedRevision = null) {
    await this.mutate(data => {
      const current = data.visits.find(v => v.id === visit.id);
      if ((expectedRevision === null && current) || (expectedRevision !== null && current?.revision !== expectedRevision)) {
        throw new Error('conflict');
      }
      data.visits = [...data.visits.filter(v => v.id !== visit.id), visit];
    });
  }
  async deleteVisit(visit) {
    await this.mutate(data => {
      if (data.visits.find(v => v.id === visit.id)?.revision !== visit.revision) throw new Error('conflict');
      data.visits = data.visits.filter(v => v.id !== visit.id);
    });
  }
  async backup() {
    const { settings, visits } = await this.snapshot();
    return { format: 'arbeitmgmt-backup', version: 1, exportedAt: new Date().toISOString(), settings, visits };
  }
  async restore(input) {
    const validated = validateBackup(input);
    await this.mutate(data => { data.settings = validated.settings; data.visits = validated.visits; });
    return validated.settings;
  }
  async erase() { await this.mutate(data => { data.settings = null; data.visits = []; }); }
}
