import { CATEGORIES } from './model.js';
import { translator } from './i18n.js';
import { formatDate, formatNumber } from './format.js';
import { reportPhotoCopy } from './photos.js';

export const PAGE = Object.freeze({ width: 1240, maxPages: 200 });

export function validateReportText(report, supportedCodePoints) {
  const values = [report.reference, report.client, report.site, ...report.notes.map(n => n.text), ...report.photos.map(p => p.caption)];
  for (const value of values) {
    for (const char of value) {
      if (!/[\n\r\t]/u.test(char) && !supportedCodePoints.has(char.codePointAt(0))) throw new Error('unsupportedPdfText');
    }
  }
}

// Build only from clientReport's allowlist, never from a stored visit or imported document definition.
export function reportDefinition(report) {
  const t = translator(report.language);
  if (report.photos.some(p => !p.caption.trim())) throw new Error('captionRequired');
  const content = [
    { text: t('reportTitle'), style: 'title', margin: [0, 0, 0, 12] },
    { text: report.reference, style: 'reference' },
  ];
  if (report.client) content.push({ text: `${t('clientLabel')}: ${report.client}`, margin: [0, 0, 0, 6] });
  if (report.site) content.push({ text: `${t('siteLabel')}: ${report.site}`, margin: [0, 0, 0, 6] });
  content.push(
    { text: `${t('created')}: ${formatDate(report.createdAt, report.language)}`, style: 'small' },
    { text: `${t('updated')}: ${formatDate(report.updatedAt, report.language)} · ${t('revision')}: ${formatNumber(report.revision, report.language)}`, style: 'small', margin: [0, 0, 0, 18] },
  );
  for (const category of CATEGORIES) {
    const notes = report.notes.filter(n => n.category === category);
    if (!notes.length) continue;
    content.push({ text: t(category), style: 'section', headlineLevel: 1 });
    for (const note of notes) content.push({ text: note.text, margin: [0, 0, 0, 10] });
  }
  if (report.photos.length) content.push({ text: t('photos'), style: 'section', headlineLevel: 1 });
  report.photos.forEach((photo, index) => {
    content.push({
      // Caption precedes its image in the content stream as well as visually.
      unbreakable: true,
      stack: [
        { text: `${t('photoLabel')} ${formatNumber(index + 1, report.language)}: ${photo.caption}`, margin: [0, 0, 0, 8] },
        { image: photo.image, fit: [499, 310] },
      ],
      margin: [0, 4, 0, 18],
    });
  });
  if (!report.notes.length && !report.photos.length) content.push({ text: t('reportEmpty') });
  return {
    pageSize: 'A4', pageMargins: [48, 62, 48, 70],
    language: report.language, version: '1.7', tagged: false, displayTitle: true,
    info: { title: t('reportTitle'), creator: 'ArbeitMgmt', producer: 'ArbeitMgmt / pdfmake' },
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.3, color: '#233b32' },
    styles: {
      title: { fontSize: 23, bold: true, color: '#163e37' },
      reference: { fontSize: 16, bold: true, margin: [0, 0, 0, 14] },
      section: { fontSize: 14, bold: true, color: '#163e37', margin: [0, 10, 0, 8] },
      small: { fontSize: 9, color: '#53665e', margin: [0, 0, 0, 6] },
    },
    header: { text: 'ArbeitMgmt', bold: true, fontSize: 10, color: '#163e37', margin: [48, 28, 48, 0] },
    footer: current => ({
      stack: [
        { text: `${t('page')} ${formatNumber(current, report.language)}`, margin: [0, 0, 0, 4] },
        { text: t('reportDisclaimer') },
      ],
      fontSize: 8, color: '#53665e', margin: [48, 16, 48, 0],
    }),
    pageBreakBefore: (current, following) => current.headlineLevel === 1 && following.length === 0,
    content,
  };
}

let runtime;
async function loadRuntime() {
  if (!runtime) {
    runtime = (async () => {
      await import('./vendor/pdfmake.min.js');
      await import('./vendor/vfs_fonts.js');
      const pdfjs = await import('./vendor/pdf.mjs');
      const { supportedCodePoints } = await import('./vendor/font-coverage.js');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
      if (!globalThis.pdfMake?.createPdf) throw new Error('pdfFailed');
      return { pdfMake: globalThis.pdfMake, pdfjs, supportedCodePoints };
    })().catch(error => { runtime = null; throw error; });
  }
  return runtime;
}

export async function renderReport(report) {
  if (report.photos.some(p => !p.caption.trim())) throw new Error('captionRequired');
  const { pdfMake, pdfjs, supportedCodePoints } = await loadRuntime();
  validateReportText(report, supportedCodePoints);
  const photos = [];
  // Restore files can contain source metadata even in a nominal "reportImage"; strip it again at export.
  for (const photo of report.photos) photos.push({ image: await reportPhotoCopy(photo.image), caption: photo.caption });
  report = { ...report, photos };
  const definition = reportDefinition(report);
  const bytes = await new Promise((resolve, reject) => {
    const chunks = [];
    // getStream is synchronous for embedded fonts and data-URL images, so layout/font errors reject here.
    const stream = pdfMake.createPdf(definition).getStream();
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' }).arrayBuffer()));
    stream.end();
  });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  // Preview the actual generated PDF, not a second independently laid-out approximation.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false });
  let document;
  try {
    document = await task.promise;
    if (document.numPages > PAGE.maxPages) throw new Error('pdfFailed');
    const pages = [];
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE.width / natural.width });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('pdfFailed');
      try {
        await page.render({ canvasContext: context, viewport }).promise;
        pages.push(canvas.toDataURL('image/png'));
      } finally { canvas.width = 0; canvas.height = 0; }
      page.cleanup();
    }
    return { pages, blob };
  } finally { await task.destroy(); }
}
