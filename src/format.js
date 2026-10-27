import { LANGUAGES } from './model.js';

function locale(language) {
  if (!LANGUAGES.includes(language)) throw new Error('invalidLanguage');
  return language;
}

export function formatNumber(value, language, options = {}) {
  return new Intl.NumberFormat(locale(language), options).format(value);
}

export function formatPrice(language) {
  return formatNumber(2.99, language, { style: 'currency', currency: 'EUR' });
}

export function formatDate(value, language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('invalidDate');
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
