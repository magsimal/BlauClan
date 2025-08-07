/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function mountFlow(options = {}) {
  const sandbox = {
    window: { ...window, ...options.windowExtras },
    document,
    console,
    setTimeout: (fn) => fn(),
    module: { exports: {} },
    exports: {},
    Vue: {
      createApp(opts) { return { mount() { return opts.setup(); } }; },
      ref: (v) => ({ value: v }),
      computed: (fn) => ({ value: fn() }),
      onMounted: () => {},
      onBeforeUnmount: () => {},
      watch: () => {},
      nextTick: (fn) => (fn ? fn() : undefined),
    },
  };
  sandbox.window.VueFlow = {
    VueFlow: {},
    MarkerType: { ArrowClosed: 'arrow' },
    Handle: {},
    useZoomPanHelper: () => ({ fitView: () => {}, zoomTo: () => {} }),
    useVueFlow: () => ({ screenToFlowCoordinate: () => ({ x:0,y:0 }), dimensions: { width: 500, height: 500 } }),
  };
  sandbox.window.GenerationLayout = { assignGenerations: () => new Map() };
  sandbox.GenerationLayout = sandbox.window.GenerationLayout;
  sandbox.fetch = () => Promise.resolve({ ok: true, json: () => ({ nodes: [] }) });
  vm.createContext(sandbox);
  if (options.windowExtras) {
    Object.entries(options.windowExtras).forEach(([k, v]) => {
      sandbox[k] = v;
    });
  }
  const code = fs.readFileSync(path.join(__dirname, '../flow.js'), 'utf8');
  vm.runInContext(code, sandbox);
  const FlowApp = sandbox.module.exports;
  const app = FlowApp.mount();
  return { sandbox, app };
}

function setup(options) {
  const fetchPeople = jest.fn().mockResolvedValue(options.existing || []);
  const createPerson = jest.fn().mockResolvedValue({ id: 99 });
  const updatePerson = jest.fn();
  const linkSpouse = jest.fn();
  const windowExtras = {
    Gedcom: { parseGedcom: jest.fn(() => options.parsed) },
    Dedupe: { findBestMatch: jest.fn(() => options.match), matchScore: jest.fn() },
    FrontendApp: {
      fetchPeople,
      createPerson,
      updatePerson,
      deletePerson: jest.fn(),
      linkSpouse,
      fetchSpouses: jest.fn(),
      deleteSpouse: jest.fn(),
      clearDatabase: jest.fn(),
    },
  };
  const { app } = mountFlow({ windowExtras });
  app.gedcomText.value = 'dummy';
  return { app, fetchPeople, createPerson, updatePerson, linkSpouse, windowExtras };
}

describe('GEDCOM import', () => {
  test('shows conflict when duplicate found', async () => {
    const parsed = { people: [{ gedcomId: '@I1@', firstName: 'Ann', lastName: 'Smith' }], families: [] };
    const match = { match: { id: 1, firstName: 'Ann', lastName: 'Smith' }, score: 5 };
    const { app, createPerson } = setup({ parsed, match, existing: [{ id: 1, firstName: 'Ann', lastName: 'Smith' }] });
    await app.processImport();
    expect(createPerson).not.toHaveBeenCalled();
    expect(app.conflicts.value.length).toBe(1);
    expect(app.showConflict.value).toBe(true);
    expect(app.showImport.value).toBe(false);
  });

  test('creates new person when no duplicate', async () => {
    const parsed = { people: [{ gedcomId: '@I2@', firstName: 'Jane', lastName: 'Doe' }], families: [] };
    const match = { match: null, score: 0 };
    const { app, fetchPeople, createPerson } = setup({ parsed, match, existing: [] });
    await app.processImport();
    expect(createPerson).toHaveBeenCalledTimes(1);
    expect(app.showConflict.value).toBe(false);
    // fetchPeople called once during processImport and again inside load()
    expect(fetchPeople.mock.calls.length).toBeGreaterThan(1);
  });
});
