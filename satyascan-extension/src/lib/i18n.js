/**
 * Extension i18n engine.
 * Imports locale objects and exposes createT(lang) → t(key, fallback).
 */

import en from '../../translations/en.json';
import hi from '../../translations/hi.json';


const LOCALES = { en, hi };

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

/**
 * Create a translator function for the given language code.
 * Falls back to English for any missing key.
 *
 * @param {string} lang  'en' | 'hi'
 * @returns {function(key: string, fallback?: string): string}
 */
export function createT(lang = 'en') {
  const locale = LOCALES[lang] || LOCALES.en;
  return (key, fallback) => {
    const r = resolvePath(locale, key);
    if (r !== undefined && r !== null) return r;
    const enR = resolvePath(LOCALES.en, key);
    if (enR !== undefined && enR !== null) return enR;
    return fallback !== undefined ? fallback : key;
  };
}

/** Read the persisted language preference. Returns 'en' or 'hi'. */
export function readStoredLang() {
  try {
    // chrome.storage.local is async — we use the sync localStorage mirror
    // that Popup.jsx writes to via setLang().
    return localStorage.getItem('satyascan-ui-lang') || 'en';
  } catch {
    return 'en';
  }
}

/** Persist language choice (mirrors to localStorage for sync reads). */
export function storeLang(lang) {
  try {
    localStorage.setItem('satyascan-ui-lang', lang);
  } catch {}
  try {
    chrome.storage.local.set({ 'satyascan-ui-lang': lang });
  } catch {}
}
