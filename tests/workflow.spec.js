import { test, expect, chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const baseURL = `http://127.0.0.1:${process.env.TEST_PORT || '42871'}`;
async function setup(page, language = 'en') {
  await page.goto('/');
  await page.locator('#language').selectOption(language);
  await page.locator('#setup button[type=submit]').click();
  await expect(page.locator('#new-visit')).toBeVisible();
}
async function createVisit(page, reference = 'SYNTHETIC garden · Łódź İstanbul Brașov') {
  await page.locator('#new-visit').click();
  await page.locator('[name=reference]').fill(reference);
  await page.locator('[name=client]').fill('Synthetic client');
  await page.locator('[name=site]').fill('Synthetic site');
  await page.locator('#create-visit button[type=submit]').click();
  await expect(page.locator('#edit-visit')).toBeVisible();
}
async function addNote(page, text, category = 'completed') {
  await page.locator('[name=new-note]').fill(text);
  await page.locator('[name=new-category]').selectOption(category);
  await page.locator('button[value=add-note]').click();
  await expect(page.locator('[name=new-note]')).toHaveValue('');
}
async function records(page) {
  return page.evaluate(async () => {
    const { LocalStore } = await import('/src/storage.js');
    const store = await new LocalStore().open();
    const result = await store.visits();
    store.db.close();
    return result;
  });
}
async function sampleImage(page, color = '#91bde6') {
  return page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#163e37'; ctx.font = '32px Arial';
    ctx.fillText('SYNTHETIC TEST PHOTO', 40, 100);
    return canvas.toDataURL('image/jpeg');
  }, color);
}

test('mobile workflow, original preservation, exact PDF/privacy and restart persistence', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await createVisit(page);
  await addNote(page, 'PRIVATE_ORIGINAL_COST_999');
  const note = page.locator('textarea[name^="note-"]').first();
  await note.fill('Österreich: erledigt. Zażółć gęślą jaźń. İstanbul: ışık. Brașov: curățat.');
  await page.locator('input[name^=visible-]').first().check();
  await page.locator('button[value=save]').click();
  await addNote(page, 'PRIVATE_NOTE_NOT_IN_REPORT', 'outstanding');
  const image = await sampleImage(page);
  const jpeg = Buffer.from(image.split(',')[1], 'base64');
  const marker = Buffer.from('PRIVATE_SOURCE_PHOTO_METADATA');
  const photoBytes = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xfe, 0, marker.length + 2]), marker, jpeg.subarray(2)]);
  const privateImage = Buffer.from((await sampleImage(page, '#ff4444')).split(',')[1], 'base64');
  await page.locator('[name=photos]').setInputFiles([
    { name: 'PRIVATE_ORIGINAL_FILENAME.jpg', mimeType: 'image/jpeg', buffer: photoBytes },
    { name: 'PRIVATE_PHOTO_FILENAME.jpg', mimeType: 'image/jpeg', buffer: privateImage },
  ]);
  await page.locator('button[value=save]').click();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page.locator('.photo-card input[type=checkbox]').first().check();
  await page.locator('.photo-card textarea').first().fill('Visible synthetic garden');
  await page.locator('.photo-card textarea').nth(1).fill('PRIVATE_PHOTO_CAPTION');
  await page.locator('button[value=preview]').click();
  await expect(page.locator('.pdf-page').first()).toBeVisible();
  await expect(page.locator('#main')).not.toContainText('PRIVATE_');
  const visits = await records(page);
  expect(visits[0].notes[0].originalText).toBe('PRIVATE_ORIGINAL_COST_999');
  expect(visits[0].notes[0].history).toHaveLength(1);
  expect(visits[0].photos[0].originalData).toBe(`data:image/jpeg;base64,${photoBytes.toString('base64')}`);
  expect(Buffer.from(visits[0].photos[0].reportImage.split(',')[1], 'base64').includes(marker)).toBe(false);
  expect(visits[0].photos[1].visibility).toBe('internal');
  const projected = await page.evaluate(async () => {
    const { LocalStore } = await import('/src/storage.js');
    const { clientReport } = await import('/src/model.js');
    const store = await new LocalStore().open();
    const visit = (await store.visits())[0];
    store.db.close();
    return clientReport(visit, 'en');
  });
  expect(JSON.stringify(projected)).not.toContain('PRIVATE_');
  const previewImages = await page.locator('.pdf-page').evaluateAll(elements => elements.map(el => el.src));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-pdf').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^visit-report-.*\.pdf$/);
  const bytes = new Uint8Array(await readFile(await download.path()));
  expect(Buffer.from(bytes).includes(marker)).toBe(false);
  expect(Buffer.from(bytes).includes(privateImage)).toBe(false);
  expect(Buffer.from(bytes).includes(photoBytes)).toBe(false);
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  expect(pdf.numPages).toBe(previewImages.length);
  expect(await pdf.getAttachments()).toBeNull();
  expect((await pdf.getMetadata()).metadata).toBeNull();
  for (let i = 0; i < previewImages.length; i++) {
    const pdfPage = await pdf.getPage(i + 1);
    const operators = await pdfPage.getOperatorList();
    expect(operators.fnArray.filter(op => op === OPS.paintImageXObject)).toHaveLength(1);
    expect((await pdfPage.getTextContent()).items).toHaveLength(0);
    const jpeg = Buffer.from(previewImages[i].split(',')[1], 'base64');
    expect(Buffer.from(bytes).includes(jpeg)).toBe(true);
  }
  await pdf.destroy();
  await page.reload();
  await expect(page.locator('.visit-card')).toHaveCount(1);
  await page.locator('.visit-card').click();
  await expect(page.locator('textarea[name^="note-"]').first()).toContainText('Österreich');
  expect((await records(page))[0].photos).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('browser close/reopen retains local data with a persistent profile', async ({}, testInfo) => {
  const profile = testInfo.outputPath('profile');
  let context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true, baseURL });
  let page = await context.newPage();
  await setup(page);
  await createVisit(page, 'SYNTHETIC persistent restart');
  await addNote(page, 'Restart survives');
  await context.close();
  context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true, baseURL });
  page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('.visit-card')).toContainText('SYNTHETIC persistent restart');
  await page.locator('.visit-card').click();
  await expect(page.locator('textarea[name^="note-"]')).toHaveValue('Restart survives');
  await context.close();
});

test('offline reload, capture and actual PDF download make no server dependency', async ({ page, context }) => {
  await setup(page);
  await createVisit(page, 'SYNTHETIC offline');
  await expect(page.locator('#offline-state')).toHaveText('Offline app ready');
  await page.reload();
  await expect(page.locator('.visit-card')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.visit-card')).toContainText('SYNTHETIC offline');
  await page.locator('.visit-card').click();
  await addNote(page, 'Captured offline');
  await page.locator('input[name^=visible-]').check();
  await page.locator('[name=photos]').setInputFiles({
    name: 'synthetic-offline.jpg', mimeType: 'image/jpeg', buffer: Buffer.from((await sampleImage(page)).split(',')[1], 'base64'),
  });
  await page.locator('button[value=preview]').click();
  await expect(page.locator('.pdf-page')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-pdf').click();
  const bytes = await readFile(await (await downloadPromise).path());
  expect(bytes.subarray(0, 8).toString()).toBe('%PDF-1.4');
  expect((await records(page))[0].notes[0].text).toBe('Captured offline');
  expect((await records(page))[0].photos).toHaveLength(1);
  await context.setOffline(false);
});

test('all five languages render Unicode PDF pages; language changes leave content untouched', async ({ page }) => {
  await setup(page);
  await createVisit(page, 'SYNTHETIC Österreich Łódź İstanbul Brașov');
  await addNote(page, 'Ö ä ß Ą ą ć ę ł ń ó ś ź ż İ ı ğ ş ț ș ă â î');
  await page.locator('input[name^=visible-]').check();
  await page.locator('button[value=save]').click();
  const originalText = (await records(page))[0].notes[0].text;
  for (const language of ['de-AT', 'pl', 'tr', 'ro', 'en']) {
    await page.locator('[data-route=settings]').click();
    await page.locator('#language').selectOption(language);
    await page.locator('#language-settings button').click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await page.locator('[data-route=home]').last().click();
    await page.locator('.visit-card').click();
    await expect(page.locator('textarea[name^=note-]')).toHaveValue(originalText);
    await page.locator('button[value=preview]').click();
    await expect(page.locator('.pdf-page')).toBeVisible();
    expect(await page.locator('.pdf-page').evaluate(el => el.naturalWidth)).toBe(1240);
    const image = await page.locator('.pdf-page').first().getAttribute('src');
    await writeFile(test.info().outputPath(`report-${language}.jpg`), Buffer.from(image.split(',')[1], 'base64'));
    await page.screenshot({ path: test.info().outputPath(`unicode-${language}.png`), fullPage: true });
  }
});

test('private backup roundtrip, invalid restore atomicity and concurrent edit protection', async ({ page }) => {
  await setup(page);
  await createVisit(page, 'SYNTHETIC backup');
  await addNote(page, 'Private durable note');
  const result = await page.evaluate(async () => {
    const { LocalStore } = await import('/src/storage.js');
    const a = await new LocalStore().open();
    const b = await new LocalStore().open();
    const settings = await a.settings();
    const backup = await a.backup(settings);
    const original = (await b.visits())[0];
    await a.saveVisit({ ...original, revision: original.revision + 1, reference: 'Newer reference' }, original.revision);
    let conflict;
    try { await b.saveVisit({ ...original, reference: 'STALE OVERWRITE' }, original.revision); } catch (error) { conflict = error.message; }
    const bad = structuredClone(backup); bad.visits[0].notes[0].visibility = 'unknown';
    let invalid;
    try { await a.restore(bad); } catch (error) { invalid = error.message; }
    const afterInvalid = await a.visits();
    await a.erase();
    await a.restore(backup);
    const restored = await a.visits();
    a.db.close(); b.db.close();
    return { conflict, invalid, afterInvalid, restored, backup };
  });
  expect(result.conflict).toBe('conflict');
  expect(result.invalid).toBe('invalidBackup');
  expect(result.afterInvalid[0].reference).toBe('Newer reference');
  expect(result.restored).toEqual(result.backup.visits);
  await page.reload();
  await page.locator('[data-route=settings]').click();
  page.once('dialog', dialog => dialog.accept());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#backup').click();
  const backup = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  expect(backup.visits[0].notes[0].text).toBe('Private durable note');
  expect(backup.visits[0].notes[0].visibility).toBe('internal');
  await expect(page.locator('#feedback')).toContainText('Verify the file was saved');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#erase').click();
  await expect(page.locator('#setup')).toBeVisible();
  await setup(page);
  await page.locator('[data-route=settings]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#restore').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.visit-card')).toContainText('SYNTHETIC backup');
});

test('trial expiry preserves records/export and has no fake payment or unlock', async ({ page }) => {
  await setup(page);
  await createVisit(page, 'SYNTHETIC expired trial');
  await addNote(page, 'Retained content');
  await page.evaluate(async () => {
    const { LocalStore } = await import('/src/storage.js');
    const store = await new LocalStore().open();
    const settings = await store.settings();
    await store.saveSettings({ ...settings, trialStartedAt: '2020-01-01T00:00:00Z' });
    store.db.close();
  });
  await page.reload();
  await expect(page.locator('#new-visit')).toBeDisabled();
  await page.locator('.visit-card').click();
  await page.locator('textarea[name^=note-]').fill('Still editable after expiry');
  await page.locator('input[name^=visible-]').check();
  await page.locator('button[value=preview]').click();
  await expect(page.locator('#download-pdf')).toBeEnabled();
  await page.locator('[data-route=settings]').click();
  await expect(page.locator('#backup')).toBeEnabled();
  await expect(page.locator('#main')).toContainText('No payment is collected');
  expect(await page.locator('button').allTextContents()).not.toContain('Buy');
});

test('unsaved changes, invalid files and storage errors are visible without false save', async ({ page }) => {
  await setup(page);
  await createVisit(page, 'SYNTHETIC errors');
  await page.locator('[name=new-note]').fill('Unsaved local draft');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-route=home]').last().click();
  await expect(page.locator('[name=new-note]')).toHaveValue('Unsaved local draft');
  await page.locator('[name=photos]').setInputFiles({ name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
  await page.locator('button[value=save]').click();
  await expect(page.locator('#feedback')).toContainText('Photo could not be read');
  expect((await records(page))[0].notes).toHaveLength(0);
  await expect(page.locator('[name=new-note]')).toHaveValue('Unsaved local draft');
  await page.locator('[name=photos]').setInputFiles([]);
  await page.evaluate(async () => {
    const { LocalStore } = await import('/src/storage.js');
    LocalStore.prototype.saveVisit = async () => { throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); };
  });
  await page.locator('button[value=save]').click();
  await expect(page.locator('#feedback')).toContainText('Could not save');
  await expect(page.locator('[name=new-note]')).toHaveValue('Unsaved local draft');
  expect((await records(page))[0].notes).toHaveLength(0);
});

test('untrusted content is text, never markup', async ({ page }) => {
  await setup(page);
  await createVisit(page, '<img src=x onerror=alert(1)>');
  await addNote(page, '<script>window.injected=true</script>');
  await expect(page.locator('h1')).toHaveText('<img src=x onerror=alert(1)>');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect(await page.locator('#main script').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('long text, all sections and image paginate without dropping included text', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const { newVisit, newNote, updateNote, clientReport } = await import('/src/model.js');
    const { renderReport } = await import('/src/pdf.js');
    const visit = newVisit('SYNTHETIC long report');
    const long = 'Łódź İstanbul Brașov Österreich '.repeat(180);
    for (const category of ['completed', 'observations', 'outstanding']) {
      visit.notes.push(updateNote(newNote(long, category), long, category, 'client'));
    }
    visit.notes.push(newNote('PRIVATE_SENTINEL'));
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#91bde6'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    visit.photos.push({ reportImage: canvas.toDataURL('image/jpeg'), visibility: 'client', caption: 'Synthetic long-report photo' });
    const drawn = [];
    const noteLines = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      drawn.push(text);
      if (this.font.startsWith('26px')) noteLines.push(text);
      return original.call(this, text, ...args);
    };
    try {
      const pdf = await renderReport(clientReport(visit, 'en'));
      return { drawn, noteLines, pages: pdf.pages.length, long, bytes: pdf.blob.size };
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
  });
  expect(result.pages).toBeGreaterThan(3);
  expect(result.bytes).toBeGreaterThan(10000);
  const drawn = result.drawn.join('');
  expect(drawn).not.toContain('PRIVATE_SENTINEL');
  for (const section of ['Work completed', 'Observations', 'Outstanding items']) expect(drawn).toContain(section);
  expect(result.noteLines.join('')).toBe(result.long.trim().repeat(3));
});

test('file share hands off only the preview PDF; cancellation and unsupported platforms are explicit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
      window.shared = { count: data.files.length, name: data.files[0].name, type: data.files[0].type, bytes: [...new Uint8Array(await data.files[0].arrayBuffer())] };
    } });
  });
  await setup(page);
  await createVisit(page, 'SYNTHETIC share');
  await addNote(page, 'PRIVATE_SHARE_SENTINEL');
  await page.locator('button[value=preview]').click();
  await page.locator('#share-pdf').click();
  await expect(page.locator('#feedback')).toContainText('handed to the selected sharing app');
  const shared = await page.evaluate(() => window.shared);
  expect(shared.count).toBe(1);
  expect(shared.type).toBe('application/pdf');
  expect(Buffer.from(shared.bytes).subarray(0, 8).toString()).toBe('%PDF-1.4');
  expect(Buffer.from(shared.bytes).toString()).not.toContain('PRIVATE_SHARE_SENTINEL');
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
  await page.locator('#share-pdf').click();
  await expect(page.locator('#feedback')).toContainText('Sharing cancelled');
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
  await page.locator('#back-editor').click();
  await page.locator('button[value=preview]').click();
  await expect(page.locator('#share-pdf')).toBeDisabled();
  await expect(page.locator('#main')).toContainText('Save the PDF and attach it yourself');
});

test('install manifest has real correctly sized PNGs cached for offline use', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#offline-state')).toHaveText('Offline app ready');
  const result = await page.evaluate(async () => {
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    const icons = [];
    for (const icon of manifest.icons) {
      const image = new Image(); image.src = icon.src;
      await image.decode();
      const cached = await caches.match(icon.src);
      icons.push({ declared: icon.sizes, width: image.naturalWidth, height: image.naturalHeight, cached: !!cached });
    }
    return { display: manifest.display, icons };
  });
  expect(result.display).toBe('standalone');
  expect(result.icons).toEqual([
    { declared: '192x192', width: 192, height: 192, cached: true },
    { declared: '512x512', width: 512, height: 512, cached: true },
  ]);
});

test('unconfirmed offline setup surfaces a failure instead of hanging or claiming readiness', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}) });
    const original = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => original(callback, delay === 15000 ? 10 : delay, ...args);
  });
  await page.goto('/');
  await expect(page.locator('#offline-state')).toContainText('Offline setup failed');
  await expect(page.locator('#offline-state')).not.toContainText('Offline app ready');
});
