const { test, expect } = require('@playwright/test');

process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.LOGIN_ENABLED = 'false';

const { app, init } = require('../../../backend/src/app');
const { sequelize } = require('../../../backend/src/models');
const dataset = require('./fixtures/large-tree-250.json');
const { startTestServer } = require('./server');

let backendServer;
let backendPort;
let frontendServer;
let frontendUrl;

test.beforeAll(async () => {
  await init();
  backendServer = await new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
  backendPort = backendServer.address().port;

  frontendServer = await startTestServer({ backendPort });
  frontendUrl = `http://127.0.0.1:${frontendServer.port}`;

  const importResponse = await fetch(`${frontendUrl}/api/import/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dataset),
  });
  if (!importResponse.ok) {
    const text = await importResponse.text();
    throw new Error(`Failed to import dataset: ${importResponse.status} ${text}`);
  }
  const peopleResponse = await fetch(`${frontendUrl}/api/people`);
  const people = await peopleResponse.json();
  if (!Array.isArray(people) || people.length !== dataset.people.length) {
    throw new Error(`Dataset verification failed: expected ${dataset.people.length} people, got ${people.length || 0}`);
  }
});

test.afterAll(async () => {
  if (frontendServer) {
    await frontendServer.close();
  }
  if (backendServer) {
    await new Promise((resolve, reject) =>
      backendServer.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await sequelize.close();
});

test('progressive loading loads all 250 nodes after interactions', async ({ page }) => {
  await page.addInitScript(() => {
    const env = (window.process && window.process.env) || {};
    window.process = { env: { ...env, NODE_ENV: 'test' } };
    window.meNodeId = 1;
  });

  await page.goto(frontendUrl);
  await page.waitForSelector('#flow-app', { timeout: 30000 });

  await page.waitForFunction(
    () => window.__FLOW_TEST_HOOKS && typeof window.__FLOW_TEST_HOOKS.getAutoExpandInternals === 'function',
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    if (window.FlowApp && typeof window.FlowApp.focusNode === 'function') {
      window.FlowApp.focusNode(1);
    }
  });
  await page.waitForTimeout(500);

  const getVisiblePersonCount = async () =>
    page.evaluate(() => {
      const hooks = window.__FLOW_TEST_HOOKS;
      if (!hooks || typeof hooks.getAutoExpandInternals !== 'function') return -1;
      const { nodes } = hooks.getAutoExpandInternals();
      return nodes.value.filter((n) => n.type === 'person').length;
    });

  const totalNodes = dataset.people.length;

  await expect
    .poll(async () => getVisiblePersonCount(), {
      timeout: 30000,
      message: 'Initial tree failed to render any person nodes',
      intervals: [200, 400, 800],
    })
    .toBeGreaterThan(0);

  const initialCount = await getVisiblePersonCount();
  expect(initialCount).toBeGreaterThan(0);
  expect(initialCount).toBeLessThan(totalNodes);

  const canvas = page.locator('#flow-app .vue-flow__pane');
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Flow canvas bounding box could not be determined');
  }

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);

  const directions = [
    { dx: 280, dy: 0 },
    { dx: -280, dy: 0 },
    { dx: 0, dy: 280 },
    { dx: 0, dy: -280 },
    { dx: 240, dy: 160 },
    { dx: -240, dy: -160 },
    { dx: 320, dy: -140 },
    { dx: -320, dy: 140 },
    { dx: 360, dy: 200 },
    { dx: -360, dy: -200 },
  ];

  let observedMax = initialCount;

  for (let cycle = 0; cycle < 40 && observedMax < totalNodes; cycle += 1) {
    const dir = directions[cycle % directions.length];
    const scale = 1 + Math.floor(cycle / directions.length);
    const dx = dir.dx * scale;
    const dy = dir.dy * scale;
    const zoomDelta = cycle % 3 === 0 ? -300 : 200;
    await page.mouse.wheel(0, zoomDelta);
    await page.waitForTimeout(350);

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + dx, center.y + dy, { steps: 16 });
    await page.mouse.up();

    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const hooks = window.__FLOW_TEST_HOOKS;
      if (!hooks || typeof hooks.getAutoExpandInternals !== 'function') return false;
      const { autoLoadSegmentsAroundViewport } = hooks.getAutoExpandInternals();
      return autoLoadSegmentsAroundViewport();
    });
    await page.waitForTimeout(600);
    const current = await getVisiblePersonCount();
    observedMax = Math.max(observedMax, current);
    if (observedMax >= totalNodes) break;
  }

  if (observedMax < totalNodes) {
    for (let attempt = 0; attempt < 15 && observedMax < totalNodes; attempt += 1) {
      await page.evaluate(() => {
        const hooks = window.__FLOW_TEST_HOOKS;
        if (!hooks || typeof hooks.getAutoExpandInternals !== 'function') return false;
        const { autoLoadSegmentsAroundViewport, scheduleSegmentAutoload } = hooks.getAutoExpandInternals();
        scheduleSegmentAutoload();
        return autoLoadSegmentsAroundViewport();
      });
      await page.waitForTimeout(800);
      const current = await getVisiblePersonCount();
      observedMax = Math.max(observedMax, current);
      if (observedMax >= totalNodes) break;
    }
  }

  await expect
    .poll(async () => getVisiblePersonCount(), {
      message: 'Expected all nodes to be loaded after viewport interactions',
      timeout: 90000,
      intervals: [500, 1000, 1500, 2000],
    })
    .toBe(totalNodes);

  const finalIds = await page.evaluate(() => {
    const hooks = window.__FLOW_TEST_HOOKS;
    if (!hooks || typeof hooks.getAutoExpandInternals !== 'function') return [];
    const { nodes } = hooks.getAutoExpandInternals();
    return nodes.value
      .filter((n) => n.type === 'person')
      .map((n) => Number(n.id))
      .sort((a, b) => a - b);
  });

  expect(new Set(finalIds).size).toBe(totalNodes);
  expect(finalIds[0]).toBe(1);
  expect(observedMax).toBe(totalNodes);
});
