(function (global) {
  const translations = {};
  const STORAGE_KEY = 'preferredLang';

  function normalizeLang(lang) {
    return (lang || 'EN').toString().trim().replace('-', '_').toUpperCase();
  }

  let current = 'EN';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) current = normalizeLang(saved);
  } catch (e) {
    /* ignore */
  }

  async function load(lang) {
    const key = normalizeLang(lang);
    if (!translations[key]) {
      try {
        const res = await fetch(`src/lang/${key.toLowerCase()}.json`);
        if (!res.ok) throw new Error('i18n file load failed');
        translations[key] = await res.json();
      } catch (e) {
        translations[key] = translations[key] || {};
      }
    }
    return translations[key];
  }

  function applyParams(template, params) {
    if (!template || typeof template !== 'string' || !params) return template;
    return template.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
      const key = rawKey.trim();
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const value = params[key];
        return value == null ? '' : String(value);
      }
      return match;
    });
  }

  function t(key, params) {
    const upper = normalizeLang(current);
    const template =
      (translations[upper] && translations[upper][key]) ||
      (translations.EN && translations.EN[key]) ||
      key;
    return applyParams(template, params);
  }

  async function setLang(lang) {
    current = normalizeLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch (e) {
      /* ignore */
    }
    await load(current);
    updateDom();
  }

  function updateDom() {
    if (typeof document === 'undefined') return;
    const map = {
      'data-i18n': (el, k) => { el.textContent = t(k); },
      'data-i18n-placeholder': (el, k) => el.setAttribute('placeholder', t(k)),
      'data-i18n-title': (el, k) => el.setAttribute('title', t(k)),
      'data-i18n-alt': (el, k) => el.setAttribute('alt', t(k)),
    };
    Object.entries(map).forEach(([attr, apply]) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => {
        apply(el, el.getAttribute(attr));
      });
    });
  }

  // Preload current language and EN fallback; update DOM on ready
  (async function initI18n() {
    try {
      await load('EN');
      await load(current);
    } catch (e) { /* ignore */ }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateDom, { once: true });
      } else {
        updateDom();
      }
    }
  })();

  global.I18n = { t, setLang, getLang: () => current, updateDom, load };
})(this);
