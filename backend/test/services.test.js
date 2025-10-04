process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { addPoints } = require('../src/services/points');
const geonames = require('../src/services/geonames');
const { sequelize, Score, Activity } = require('../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

test('addPoints creates score row and logs activity', async () => {
  await addPoints('tester', 3, 'Did something');
  const row = await Score.findOne({ where: { username: 'tester' } });
  expect(row).toBeTruthy();
  expect(row.points).toBe(3);
  const logs = await Activity.findAll({ where: { username: 'tester' } });
  expect(logs.length).toBe(1);
  expect(logs[0].points).toBe(3);
});

test('geonamesSuggest returns empty array on network error', async () => {
  const origFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
  const res = await geonames.geonamesSuggest('Berlin', 'en');
  expect(Array.isArray(res)).toBe(true);
  expect(res.length).toBe(0);
  global.fetch = origFetch;
});

test('geonamesSuggest sanitizes input and caches', async () => {
  const origFetch = global.fetch;
  const payload = { geonames: [{ geonameId: 1, name: 'X', adminName1: 'A', countryCode: 'US', lat: '0', lng: '0', score: 1, fcode: 'PPL' }] };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  const first = await geonames.geonamesSuggest('\u0000  X  ', 'en');
  const second = await geonames.geonamesSuggest('x', 'en');
  expect(first.length).toBe(1);
  expect(second.length).toBe(1);
  // First call triggers search + postal code fetch, second call should hit cache and not perform search
  const callsToSearch = global.fetch.mock.calls.filter(([url]) => /searchJSON\?/.test(url)).length;
  expect(callsToSearch).toBe(1);
  global.fetch = origFetch;
});

test('geonamesSuggest caches empty results to avoid duplicate requests', async () => {
  const origFetch = global.fetch;
  const payload = { geonames: [] };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  const first = await geonames.geonamesSuggest('Some Unknown Place', 'en');
  expect(Array.isArray(first)).toBe(true);
  expect(first.length).toBe(0);
  const second = await geonames.geonamesSuggest('some unknown place', 'en');
  expect(Array.isArray(second)).toBe(true);
  expect(second.length).toBe(0);
  const callsToSearch = global.fetch.mock.calls.filter(([url]) => /searchJSON\?/.test(url)).length;
  expect(callsToSearch).toBe(1);
  global.fetch = origFetch;
});
