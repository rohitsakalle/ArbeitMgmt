import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (process.env.BUILD_CHANNEL === 'production') {
  throw new Error('Production release blocked: billing enforcement, legal review and device acceptance are not configured. This builds a beta only.');
}
await import('./icons.js');
await import('./prepare-runtime.js');
const files = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'src/main.js', 'src/model.js', 'src/storage.js', 'src/i18n.js', 'src/format.js', 'src/photos.js', 'src/pdf.js', 'src/style.css',
  'src/vendor/pdfmake.min.js', 'src/vendor/vfs_fonts.js', 'src/vendor/font-coverage.js', 'src/vendor/pdf.mjs', 'src/vendor/pdf.worker.mjs', 'src/vendor/pdfmake-LICENSE.txt', 'src/vendor/pdfjs-LICENSE.txt', 'src/vendor/Roboto-OFL.txt', 'src/vendor/THIRD-PARTY-NOTICES.txt'];
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const swSource = await readFile('sw.js', 'utf8');
hash.update(swSource);
const version = hash.digest('hex').slice(0, 16);
await mkdir('dist', { recursive: true });
for (const file of files) {
  await mkdir(`dist/${file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''}`, { recursive: true });
  await cp(file, `dist/${file}`);
}
const sw = swSource.replace("'arbeitmgmt-dev-v1'", `'arbeitmgmt-${version}'`);
await writeFile('dist/sw.js', sw);
console.log(`Built offline beta ${version} in dist. No deployment performed.`);
