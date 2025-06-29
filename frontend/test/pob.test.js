/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FrontendApp = require('../app');

function loadVue() {
  const sandbox = { window, document, navigator, console, SVGElement: window.SVGElement, Element: window.Element };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../vue.global.js'), 'utf8'), sandbox);
  global.Vue = sandbox.Vue;
  return sandbox.Vue;
}

describe('place of birth suggestions', () => {
  let Vue;
  let vmApp;

  beforeEach(async () => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <div id="app">
        <div v-if="selectedPerson" class="edit-section">
          <input id="pobInput" v-model="selectedPerson.placeOfBirth"
            @focus="pobFocus=true" @blur="hidePobDropdown" @input="onPobInput">
          <ul v-if="pobFocus && pobSuggestions.length">
            <li v-for="s in visiblePobSuggestions" :key="s.geonameId" class="list-group-item list-group-item-action" @mousedown.stop.prevent="applyPob(s)">{{ s.name }}</li>
            <li class="list-group-item list-group-item-action" @mousedown.stop.prevent="useTypedPob">Use Exactly</li>
          </ul>
        </div>
      </div>`;
    Vue = loadVue();
    global.fetch = jest.fn().mockResolvedValue({ json: () => [] });
    vmApp = FrontendApp.mountApp();
    await Vue.nextTick();
    vmApp.selectedPerson = { id: 1, placeOfBirth: '', geonameId: null };
  });

  afterEach(() => {
    delete global.Vue;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('selecting suggestion updates person', async () => {
    vmApp.pobSuggestions = [{ geonameId: 7, name: 'Foo', countryCode: 'US' }];
    vmApp.pobFocus = true;
    await Vue.nextTick();
    const item = document.querySelector('li.list-group-item');
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const input = document.getElementById('pobInput');
    item.dispatchEvent(new Event('mousedown', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    jest.runOnlyPendingTimers();
    await Vue.nextTick();
    expect(vmApp.selectedPerson.placeOfBirth).toContain('Foo');
    expect(vmApp.selectedPerson.geonameId).toBe(7);
    expect(vmApp.pobSuggestions.length).toBe(0);
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
