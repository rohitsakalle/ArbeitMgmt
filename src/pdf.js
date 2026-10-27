import { CATEGORIES } from './model.js';
import { translator } from './i18n.js';

export const PAGE = Object.freeze({ width: 1240, height: 1754, margin: 88 });
const encoder = new TextEncoder();

// Each PDF page embeds only the exact raster shown in the preview: no text layer, attachments or EXIF.
export function encodePdf(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 200) throw new Error('pdfFailed');
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const push = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes); length += bytes.length;
  };
  const object = (number, parts) => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
    parts.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%ArbeitMgmt\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`]);
  pages.forEach((page, i) => {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(page)) throw new Error('pdfFailed');
    const binary = atob(page.split(',')[1]);
    const image = Uint8Array.from(binary, c => c.charCodeAt(0));
    const number = 3 + i * 3;
    const stream = 'q\n595.28 0 0 841.89 0 0 cm\n/Img Do\nQ\n';
    object(number, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Img ${number + 1} 0 R >> >> /Contents ${number + 2} 0 R >>`]);
    object(number + 1, [`<< /Type /XObject /Subtype /Image /Width ${PAGE.width} /Height ${PAGE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`, image, '\nendstream']);
    object(number + 2, [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`]);
  });
  const xref = length;
  push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => push(`${String(offset).padStart(10, '0')} 00000 n \n`));
  push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function renderReport(report) {
  const t = translator(report.language);
  const { width, height, margin } = PAGE;
  const bottom = height - 130;
  const pages = [];
  let canvas, ctx, y;
  function startPage() {
    if (canvas) finishPage();
    if (pages.length >= 199) throw new Error('pdfFailed');
    canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('pdfFailed');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#163e37'; ctx.fillRect(0, 0, width, 18);
    ctx.textBaseline = 'top';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('ArbeitMgmt', margin, 55);
    ctx.fillStyle = '#53665e'; ctx.font = '20px Arial, sans-serif';
    ctx.fillText(t('reportTitle'), margin, 88);
    y = 145;
  }
  function finishPage() {
    ctx.fillStyle = '#64736a'; ctx.font = '18px Arial, sans-serif';
    ctx.fillText(`${t('page')} ${pages.length + 1}`, margin, height - 82);
    ctx.fillText(t('reportDisclaimer'), margin, height - 54);
    pages.push(canvas.toDataURL('image/jpeg', 0.93));
    canvas.width = 0; canvas.height = 0;
  }
  function line(text, size, bold) {
    if (y + size * 1.5 > bottom) startPage();
    ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
    ctx.fillStyle = bold ? '#163e37' : '#233b32';
    ctx.fillText(text, margin, y);
    y += size * 1.5;
  }
  function text(value, size = 26, bold = false) {
    // Break by grapheme so long references/words and Polish/Turkish/Romanian diacritics never clip.
    const segmenter = new Intl.Segmenter(report.language, { granularity: 'grapheme' });
    for (const paragraph of String(value).split(/\r?\n/)) {
      ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
      let buffer = '';
      for (const { segment } of segmenter.segment(paragraph)) {
        if (ctx.measureText(buffer + segment).width > width - margin * 2 && buffer) {
          line(buffer, size, bold); buffer = '';
          ctx.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
        }
        buffer += segment;
      }
      line(buffer, size, bold);
    }
    y += 14;
  }
  startPage();
  text(report.reference, 42, true);
  if (report.client) text(`${t('client').split(' (')[0]}: ${report.client}`);
  if (report.site) text(`${t('site').split(' (')[0]}: ${report.site}`);
  const formatDate = value => new Intl.DateTimeFormat(report.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  text(`${t('created')}: ${formatDate(report.createdAt)}`, 20);
  text(`${t('updated')}: ${formatDate(report.updatedAt)} · ${t('revision')}: ${report.revision}`, 20);
  y += 16;
  for (const category of CATEGORIES) {
    const notes = report.notes.filter(n => n.category === category);
    if (!notes.length) continue;
    if (y + 130 > bottom) startPage();
    text(t(category), 30, true);
    for (const note of notes) text(note.text);
  }
  if (report.photos.length) {
    if (y + 180 > bottom) startPage();
    text(t('photos'), 30, true);
  }
  for (const photo of report.photos) {
    const image = new Image();
    image.src = photo.image;
    await image.decode();
    if (!image.width || !image.height) throw new Error('pdfFailed');
    const scale = Math.min((width - 2 * margin) / image.width, 760 / image.height);
    const drawWidth = image.width * scale, drawHeight = image.height * scale;
    if (y + drawHeight + 80 > bottom) startPage();
    ctx.drawImage(image, margin, y, drawWidth, drawHeight);
    y += drawHeight + 18;
    if (photo.caption) text(photo.caption, 23);
    y += 16;
  }
  if (!report.notes.length && !report.photos.length) text(t('reportEmpty'));
  finishPage();
  return { pages, blob: encodePdf(pages) };
}
