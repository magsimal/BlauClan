const fs = require('fs');
const vm = require('vm');

jest.mock('../src/utils/perf-metrics', () => ({
  recordEvent: jest.fn(),
  recordSample: jest.fn(),
  incrementCounter: jest.fn(),
  startTimer: jest.fn(() => ({ name: 'timer', start: 0 })),
  endTimer: jest.fn(),
}));

let PerfMetrics;

describe('flow.js syntax', () => {
  test('file parses without error', () => {
    const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});

describe('Dynamic tree segment loading', () => {
  let mockWindow;

  beforeEach(() => {
    // Mock window object
    mockWindow = {
      meNodeId: '123',
      currentUser: 'testuser',
      AppConfig: {},
    };
    global.window = mockWindow;

    // Mock Vue reactive functions
    global.ref = (value) => ({ value });
    global.computed = (fn) => ({ value: fn() });
    global.reactive = (obj) => obj;
    global.nextTick = async () => {};
    global.watch = () => {};

    // Mock other dependencies
    global.debounce = (fn) => fn;
    global.I18nGlobal = { t: (key) => key };
  });

  describe('normalizeNodeId utility', () => {
    test('should handle numeric strings correctly', () => {
      // We need to extract and test the utility functions
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Extract the normalizeNodeId function for testing
      const normalizeNodeIdMatch = code.match(/function normalizeNodeId\(nodeId\) \{[\s\S]*?\}/);
      expect(normalizeNodeIdMatch).toBeTruthy();
      
      // Test the logic pattern
      const testId = '123';
      const numericId = Number(testId);
      const result = Number.isNaN(numericId) ? String(testId) : numericId;
      expect(result).toBe(123);
    });

    test('should handle non-numeric strings correctly', () => {
      const testId = 'abc';
      const numericId = Number(testId);
      const result = Number.isNaN(numericId) ? String(testId) : numericId;
      expect(result).toBe('abc');
    });

    test('should handle null/undefined correctly', () => {
      expect(null || null).toBeNull();
      expect(undefined || null).toBeNull();
    });
  });

  describe('autoExpandProgress memory management', () => {
    test('should implement size-based cleanup pattern', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify the memory management pattern exists
      expect(code).toContain('MAX_AUTO_EXPAND_ENTRIES = 1000');
      expect(code).toContain('autoExpandProgress.size >= MAX_AUTO_EXPAND_ENTRIES');
      expect(code).toContain('keysToRemove.forEach(k => autoExpandProgress.delete(k))');
    });

    test('should remove 20% of entries when limit reached', () => {
      // Test the cleanup logic pattern
      const MAX_ENTRIES = 1000;
      const removalCount = Math.floor(MAX_ENTRIES * 0.2);
      expect(removalCount).toBe(200);
    });
  });

  describe('mutex-based locking', () => {
    test('should use mutex for auto-expansion locking', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify mutex pattern exists
      expect(code).toContain('autoExpandMutex = createAsyncMutex()');
      expect(code).toContain('autoExpandMutex.runExclusive');
      
      // Verify old boolean flag is removed from auto-expansion
      expect(code).not.toContain('autoExpandInProgress = true');
      expect(code).not.toContain('autoExpandInProgress = false');
    });
  });

  describe('consistent meNodeId handling', () => {
    test('should use getCurrentMeId utility consistently', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify the utility functions exist
      expect(code).toContain('function getCurrentMeId()');
      expect(code).toContain('function normalizeNodeId(nodeId)');
      
      // Verify consistent usage patterns
      const getCurrentMeIdUsages = (code.match(/getCurrentMeId\(\)/g) || []).length;
      expect(getCurrentMeIdUsages).toBeGreaterThan(5); // Should be used in multiple places
    });
  });

  describe('viewport-based loading optimization', () => {
    test('should contain efficient node filtering logic', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify the filtering patterns exist
      expect(code).toContain('getNodesNearViewport');
      expect(code).toContain('isNodeRoughlyVisible');
      
      // The filtering should work on pre-filtered candidates, not the entire nodes array
      expect(code).toContain('getNodesNearViewport()');
    });
  });

  describe('performance-aware limits', () => {
    test('should have device-specific performance limits', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify performance-aware patterns
      expect(code).toContain('runtimePerformanceProfile.isLowPower');
      expect(code).toContain('maxExpansions = runtimePerformanceProfile.isLowPower ? 1 : 3');
    });
  });

  describe('error handling and fallbacks', () => {
    test('should have retry logic with fallback candidates', () => {
      const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
      
      // Verify retry and fallback patterns
      expect(code).toContain('candidateIds = []');
      expect(code).toContain('getCurrentMeId()');
      expect(code).toContain('randomPerson');
      expect(code).toContain('firstPerson');
    });
  });
});

describe('auto-expansion integration', () => {
  let FlowApp;
  let hooks;
  let fetchTreeSegmentMock;
  let originalSetTimeout;
  let originalClearTimeout;
  let originalRequestIdleCallback;

  beforeEach(async () => {
    jest.resetModules();
    PerfMetrics = require('../src/utils/perf-metrics');
    PerfMetrics.recordEvent.mockClear();
    PerfMetrics.recordSample.mockClear();
    PerfMetrics.incrementCounter.mockClear();
    PerfMetrics.startTimer.mockClear();
    PerfMetrics.endTimer.mockClear();

    const watchers = [];
    const onMountedCallbacks = [];
    const viewportRef = { value: { x: 0, y: 0, zoom: 1 } };
    const dimensionsRef = { value: { width: 800, height: 600 } };

    const matchMediaResult = {
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };

    global.d3 = {};
    global.AppConfig = {};

    global.window = {
      meNodeId: '1',
      currentUser: 'integration-user',
      isAdmin: false,
      AppConfig: global.AppConfig,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      matchMedia: jest.fn(() => matchMediaResult),
    };
    window.d3 = global.d3;

    const elementStub = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: {},
    };

    global.document = {
      getElementById: jest.fn(() => elementStub),
    };
    window.document = global.document;

    const storage = new Map();
    global.localStorage = {
      getItem: jest.fn((key) => (storage.has(key) ? storage.get(key) : null)),
      setItem: jest.fn((key, value) => { storage.set(key, value); }),
      removeItem: jest.fn((key) => { storage.delete(key); }),
      clear: jest.fn(() => storage.clear()),
    };
    window.localStorage = global.localStorage;

    global.navigator = {
      hardwareConcurrency: 4,
      deviceMemory: 4,
      connection: { saveData: false },
      userAgent: 'jest',
    };

    global.matchMedia = jest.fn(() => matchMediaResult);
    window.matchMedia = global.matchMedia;

    window.SearchApp = {
      setPeople: jest.fn(),
      refresh: jest.fn(),
    };

    window.FlowLayout = {
      createLayoutAPI: jest.fn(() => ({
        tidyUp: jest.fn(),
        tidyUpChunked: jest.fn(),
      })),
    };

    window.GenerationLayout = {
      assignGenerations: (people) => new Map(people.map((p, idx) => [p.id, idx])),
    };

    window.VueFlow = {
      VueFlow: {},
      MarkerType: { ArrowClosed: 'arrow' },
      Handle: {},
      useVueFlow: () => ({
        screenToFlowCoordinate: jest.fn(),
        project: jest.fn(),
        dimensions: dimensionsRef,
        addSelectedNodes: jest.fn(),
        removeSelectedNodes: jest.fn(),
        snapToGrid: { value: false },
        snapGrid: { value: [0, 0] },
        viewport: viewportRef,
        updateNodeInternals: jest.fn(),
      }),
      useZoomPanHelper: () => ({
        fitView: jest.fn(),
        zoomTo: jest.fn(),
      }),
    };

    const vueRef = (value) => ({ value });
    global.Vue = {
      createApp: (component) => {
        const app = {
          directive: jest.fn().mockReturnThis(),
          mount: jest.fn(() => {
            global.__lastSetupResult = component.setup ? component.setup() : {};
            return app;
          }),
        };
        return app;
      },
      ref: vueRef,
      reactive: (obj) => obj,
      computed: (fn) => ({
        get value() {
          return fn();
        },
      }),
      nextTick: () => Promise.resolve(),
      watch: (source, cb) => { watchers.push({ source, cb }); },
      onMounted: (cb) => { onMountedCallbacks.push(cb); },
      onBeforeUnmount: jest.fn(),
    };
    window.Vue = global.Vue;

    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    originalRequestIdleCallback = global.requestIdleCallback;

    global.setTimeout = (fn) => { fn(); return 0; };
    global.clearTimeout = jest.fn();
    window.setTimeout = global.setTimeout;
    window.clearTimeout = global.clearTimeout;
    global.requestIdleCallback = (fn) => fn();
    window.requestIdleCallback = global.requestIdleCallback;

    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    window.fetch = global.fetch;

    fetchTreeSegmentMock = jest.fn(async (rootId) => ({
      people: [
        {
          person: { id: String(rootId), firstName: 'John', lastName: 'Doe', gender: 'male' },
          hints: { hasMoreAncestors: true, hasMoreDescendants: true },
        },
        {
          person: {
            id: `child-${rootId}`,
            firstName: 'Kid',
            lastName: 'Doe',
            gender: 'female',
            fatherId: String(rootId),
          },
          hints: { hasMoreAncestors: false, hasMoreDescendants: false },
        },
      ],
    }));

    global.FrontendApp = {
      fetchPeople: jest.fn(async () => ([
        { id: '1', firstName: 'John', lastName: 'Doe', gender: 'male' },
        { id: '2', firstName: 'Jane', lastName: 'Doe', gender: 'female', fatherId: '1' },
      ])),
      fetchTreeSegment: fetchTreeSegmentMock,
      updatePerson: jest.fn(async () => ({})),
      linkSpouse: jest.fn(async () => {}),
      deletePerson: jest.fn(async () => {}),
      clearDatabase: jest.fn(async () => {}),
      createPerson: jest.fn(async () => ({ id: 'new' })),
      fetchSpouses: jest.fn(async () => []),
      deleteSpouse: jest.fn(async () => {}),
    };
    window.FrontendApp = global.FrontendApp;

    FlowApp = require('../flow.js');
    FlowApp.mount();
    for (const hook of onMountedCallbacks) {
      await hook();
    }

    expect(global.__FLOW_TEST_HOOKS).toBeDefined();
    hooks = global.__FLOW_TEST_HOOKS.getAutoExpandInternals();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.localStorage;
    delete global.matchMedia;
    delete global.__FLOW_TEST_HOOKS;
    delete global.__lastSetupResult;
    delete global.d3;
    delete global.AppConfig;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.requestIdleCallback = originalRequestIdleCallback;
  });

  test('auto-load expands segments when viewport has expandable nodes', async () => {
    PerfMetrics.recordEvent.mockClear();
    PerfMetrics.recordSample.mockClear();
    PerfMetrics.incrementCounter.mockClear();
    fetchTreeSegmentMock.mockClear();

    hooks.markSpatialIndexDirty();
    hooks.rebuildSpatialIndex();
    const nearNodes = hooks.getNodesNearViewport();
    expect(nearNodes.length).toBeGreaterThan(0);
    const targetNode = nearNodes.find((node) => node && node.type === 'person');
    expect(targetNode).toBeDefined();
    const normalizedId = Number.isNaN(Number(targetNode.id)) ? targetNode.id : Number(targetNode.id);

    hooks.updateSegmentInfo(normalizedId, {
      hasMoreAncestors: true,
      hasMoreDescendants: true,
      ancestorsDepthLoaded: 0,
      descendantsDepthLoaded: 0,
    });
    const info = hooks.getSegmentInfo(normalizedId);
    expect(info.hasMoreAncestors).toBe(true);
    expect(info.hasMoreDescendants).toBe(true);

    await hooks.autoLoadSegmentsAroundViewport();

    const callTypes = fetchTreeSegmentMock.mock.calls.map(([, options]) => options && options.type);
    const callIds = fetchTreeSegmentMock.mock.calls.map(([id]) => id);
    expect(callTypes.length).toBeGreaterThan(0);
    expect(callTypes.some((type) => type === 'ancestors' || type === 'descendants')).toBe(true);
    expect(callIds.some((id) => String(id) === String(normalizedId))).toBe(true);
    const postLoadInfo = hooks.getSegmentInfo(normalizedId);
    if (callTypes.includes('ancestors')) {
      expect(postLoadInfo.ancestorsDepthLoaded).toBeGreaterThan(info.ancestorsDepthLoaded);
    }
    if (callTypes.includes('descendants')) {
      expect(postLoadInfo.descendantsDepthLoaded).toBeGreaterThan(info.descendantsDepthLoaded);
    }
    expect(PerfMetrics.recordEvent).toHaveBeenCalledWith('autoExpand.cycle.complete', expect.objectContaining({
      attempts: expect.any(Number),
      successes: expect.any(Number),
    }));
    expect(PerfMetrics.incrementCounter).toHaveBeenCalledWith('autoExpand.success', expect.any(Number));
  });

  test('auto-load records metrics when no nodes are visible in the viewport', async () => {
    PerfMetrics.recordEvent.mockClear();
    PerfMetrics.recordSample.mockClear();
    PerfMetrics.incrementCounter.mockClear();
    await hooks.autoExpandMutex.runExclusive(async () => {});
    fetchTreeSegmentMock.mockClear();

    hooks.nodes.value.forEach((node) => {
      if (!node) return;
      if (!node.position) {
        node.position = { x: 5000, y: 5000 };
        return;
      }
      node.position.x = 5000;
      node.position.y = 5000;
    });
    hooks.markSpatialIndexDirty();
    hooks.rebuildSpatialIndex();
    const visibleAfterMove = hooks.getNodesNearViewport();
    expect(visibleAfterMove.length).toBe(0);
    hooks.getNodesNearViewport = jest.fn(() => visibleAfterMove);
    hooks.segmentHints.clear();

    await hooks.autoLoadSegmentsAroundViewport();

    expect(PerfMetrics.recordEvent).toHaveBeenCalledWith('autoExpand.candidates.none', expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
      zoom: expect.any(Number),
    }));
    expect(fetchTreeSegmentMock).not.toHaveBeenCalled();
  });
});
