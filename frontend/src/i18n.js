(function (global) {
  const translations = {};
  let current = 'EN';

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
  }

  global.I18n = { t, setLang, getLang: () => current, updateDom, load };
})(this);
