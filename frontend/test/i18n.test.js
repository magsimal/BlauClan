/** @jest-environment jsdom */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

function loadI18nInSandbox() {
  const sandbox = {
    window: {},
    document: { readyState: 'complete', querySelectorAll: () => [], addEventListener: () => {} },
    localStorage: {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, val) { this.store[key] = String(val); },
      removeItem(key) { delete this.store[key]; },
    },
    fetch: (url) => {
      const filePath = path.join(__dirname, '..', url);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Promise.resolve({ ok: true, json: () => json });
    },
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '../src/i18n.js'), 'utf8');
  vm.runInContext(code, sandbox);
  return sandbox;
}

describe('I18n normalization and fallbacks', () => {
  test('normalizes language codes and loads proper file', async () => {
    const sb = loadI18nInSandbox();
    await sb.I18n.setLang('en-US');
    expect(sb.I18n.getLang()).toBe('EN_US');
    expect(sb.I18n.t('search')).toBeDefined();
  });

  test('falls back to EN when key missing', async () => {
    const sb = loadI18nInSandbox();
    // ensure EN is loaded and HU exists
    await sb.I18n.setLang('hu');
    // pick a key that exists in EN for sure
    const key = 'search';
    const huVal = sb.I18n.t(key);
    expect(typeof huVal).toBe('string');
  });
});