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

  global.I18n = { t, setLang, getLang: () => current, updateDom, load };
})(this);
