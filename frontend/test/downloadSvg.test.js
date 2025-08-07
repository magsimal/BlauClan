/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function mountFlow(windowExtras = {}) {
  const sandbox = {
    window: { ...window, ...windowExtras },
    document,
    console,
    module: { exports: {} },
    exports: {},
    setTimeout: (fn, delay) => fn(), // Mock setTimeout to execute immediately
    Vue: {
      createApp(options) { return { mount() { return options.setup(); } }; },
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
    MarkerType: {},
    Handle: {},
    useZoomPanHelper: () => ({ fitView: () => {} }),
    useVueFlow: () => ({ screenToFlowCoordinate: () => {}, dimensions: {}, vueFlowRef: {} }),
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '../flow.js'), 'utf8');
  vm.runInContext(code, sandbox);
  const FlowApp = sandbox.module.exports;
  const app = FlowApp.mount();
  return { sandbox, app };
}

describe('downloadSvg', () => {
  test('calls ExportSvg when available', () => {
    const exportSpy = jest.fn();
    const { app } = mountFlow({ ExportSvg: { exportFamilyTree: exportSpy } });
    app.nodes.value = [{ id: 'n1', data: { id: 1, firstName: 'A', lastName: 'B' } }];
    app.downloadSvg();
    expect(exportSpy).toHaveBeenCalledTimes(1);
    const arg = exportSpy.mock.calls[0][0];
    expect(arg.data.children[0].id).toBe(1);
  });

  test('logs error when ExportSvg missing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = mountFlow();
    app.nodes.value = [{ id: 'n1', data: { id: 1, firstName: 'A', lastName: 'B' } }];
    app.downloadSvg();
    expect(errorSpy).toHaveBeenCalledWith('ExportSvg utility not loaded');
    errorSpy.mockRestore();
  });
});

describe('downloadBloodlineSvg', () => {
  test('function exists and can be called', () => {
    const { app } = mountFlow();
    expect(typeof app.downloadBloodlineSvg).toBe('function');
    expect(() => app.downloadBloodlineSvg()).not.toThrow();
  });

  test('shows warning when no node selected', () => {
    const { app } = mountFlow();
    
    app.selectedNodes.value = [];
    app.downloadBloodlineSvg();
    
    // The function should not throw when no nodes are selected
    expect(() => app.downloadBloodlineSvg()).not.toThrow();
  });

  test('shows warning when multiple nodes selected', () => {
    const { app } = mountFlow();
    
    app.selectedNodes.value = [
      { id: 'n1', data: { id: 1, firstName: 'A', lastName: 'B' } },
      { id: 'n2', data: { id: 2, firstName: 'C', lastName: 'D' } }
    ];
    
    // The function should not throw when multiple nodes are selected
    expect(() => app.downloadBloodlineSvg()).not.toThrow();
  });
});
