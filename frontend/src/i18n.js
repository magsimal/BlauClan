(function (global) {
  const translations = {};
  const STORAGE_KEY = 'preferredLang';
  let current = 'EN';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) current = saved;
  } catch (e) {
    /* ignore */
  }

  async function load(lang) {
    if (!translations[lang]) {
      const res = await fetch(`src/lang/${lang.toLowerCase()}.json`);
      translations[lang] = await res.json();
    }
  }

  function t(key) {
    return (translations[current] && translations[current][key]) ||
           (translations.EN && translations.EN[key]) || key;
  }

  async function setLang(lang) {
    current = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* ignore */
    }
    await load(lang);
    updateDom();
  }

  function updateDom() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const k = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(k));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const k = el.getAttribute('data-i18n-title');
      el.setAttribute('title', t(k));
    });
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const k = el.getAttribute('data-i18n-alt');
      el.setAttribute('alt', t(k));
    });
  }

  global.I18n = { t, setLang, getLang: () => current, updateDom, load };
})(this);
