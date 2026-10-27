import { mkdir, cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

await mkdir('src/vendor', { recursive: true });
const files = [
  ['node_modules/pdfmake/build/pdfmake.min.js', 'pdfmake.min.js'],
  ['node_modules/pdfmake/build/vfs_fonts.js', 'vfs_fonts.js'],
  ['node_modules/pdfjs-dist/build/pdf.mjs', 'pdf.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.mjs', 'pdf.worker.mjs'],
  ['node_modules/pdfmake/LICENSE', 'pdfmake-LICENSE.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'pdfjs-LICENSE.txt'],
  ['licenses/Roboto-OFL.txt', 'Roboto-OFL.txt'],
];
for (const [source, target] of files) await cp(source, `src/vendor/${target}`);
const fontkit = require('@foliojs-fork/fontkit');
const fonts = require('pdfmake/build/vfs_fonts.js');
const regular = fontkit.create(Buffer.from(fonts['Roboto-Regular.ttf'], 'base64'));
const bold = fontkit.create(Buffer.from(fonts['Roboto-Medium.ttf'], 'base64'));
const codePoints = regular.characterSet.filter(point => bold.hasGlyphForCodePoint(point));
await writeFile('src/vendor/font-coverage.js', `export const supportedCodePoints = new Set(${JSON.stringify(codePoints)});\n`);

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev || entry.optional) continue;
  const metadata = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
  const names = await readdir(path);
  const licenseFiles = names.filter(name => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name));
  // Some upstream packages publish only a license declaration in their README/package metadata.
  const sourceFiles = licenseFiles.length ? licenseFiles : names.filter(name => /^readme\.md$/i.test(name));
  if (!sourceFiles.length) throw new Error(`Missing third-party license notice: ${path}`);
  notices.push(`\n===== ${metadata.name} ${metadata.version} =====\n${JSON.stringify({ license: metadata.license, author: metadata.author, contributors: metadata.contributors, repository: metadata.repository }, null, 2)}\n`);
  for (const file of sourceFiles) notices.push(`\n--- ${file} ---\n${await readFile(`${path}/${file}`, 'utf8')}\n`);
}
await writeFile('src/vendor/THIRD-PARTY-NOTICES.txt', notices.join(''));
