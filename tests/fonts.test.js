import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LANGUAGES } from '../src/model.js';
import { messages, nativeMessages, translator } from '../src/i18n.js';
import { validateReportText } from '../src/pdf.js';
import { newVisit, newNote, updateNote, clientReport } from '../src/model.js';

const require = createRequire(import.meta.url);
const fontkit = require('@foliojs-fork/fontkit');
const fonts = require('pdfmake/build/vfs_fonts.js');

test('bundled regular and bold fonts cover all five UI/templates and target-language diacritics', () => {
  const sample = 'Österreich äöüÄÖÜß Zażółć gęślą jaźń ĄĆĘŁŃÓŚŹŻ İstanbul ışık çÇğĞıİöÖşŞüÜ Brașov curățat ăâîșțĂÂÎȘȚ €';
  const required = new Set([...sample]);
  for (const language of LANGUAGES) {
    for (const key of Object.keys(messages[language])) {
      for (const char of translator(language)(key)) if (!/\s/u.test(char)) required.add(char);
    }
    assert.deepEqual(Object.keys(nativeMessages[language]).sort(), Object.keys(nativeMessages.en).sort());
    for (const key of Object.keys(nativeMessages[language])) {
      const text = translator(language, true)(key);
      assert(text.length && !text.includes('\uFFFD') && !text.includes('{price}'));
      for (const char of text) if (!/\s/u.test(char)) required.add(char);
    }
  }
  for (const name of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf']) {
    const font = fontkit.create(Buffer.from(fonts[name], 'base64'));
    assert.match(font.copyright, /2011 The Roboto Project Authors/);
    for (const char of required) assert(font.hasGlyphForCodePoint(char.codePointAt(0)), `${name} lacks ${char} U+${char.codePointAt(0).toString(16)}`);
  }
});

test('unsupported selected characters fail explicitly; private unsupported text never reaches PDF validation', () => {
  const font = fontkit.create(Buffer.from(fonts['Roboto-Regular.ttf'], 'base64'));
  const coverage = new Set(font.characterSet);
  const visit = newVisit('Synthetic Unicode');
  visit.notes.push(newNote('Private broom 🧹'));
  assert.doesNotThrow(() => validateReportText(clientReport(visit, 'en'), coverage));
  visit.notes.push(updateNote(newNote('Selected broom 🧹'), 'Selected broom 🧹', 'completed', 'client'));
  assert.throws(() => validateReportText(clientReport(visit, 'en'), coverage), /unsupportedPdfText/);
});
