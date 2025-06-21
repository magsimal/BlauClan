process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const app = require('../src/index');
const { sequelize } = require('../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('People API', () => {
  test('CRUD and tree endpoints', async () => {
    // create people
    await request(app).post('/api/people').send({ firstName: 'John', lastName: 'Doe' });
    await request(app).post('/api/people').send({ firstName: 'Jane', lastName: 'Smith' });
    await request(app).post('/api/people').send({ firstName: 'Child', lastName: 'Doe', fatherId: 1, motherId: 2 });

    // create marriage
    const marriageRes = await request(app)
      .post('/api/people/1/spouses')
      .send({ spouseId: 2, dateOfMarriage: '2000-01-01' });
    expect(marriageRes.statusCode).toBe(201);

    // retrieve tree
    const treeRes = await request(app).get('/api/tree/1?type=descendants');
    expect(treeRes.statusCode).toBe(200);
    expect(treeRes.body.descendants.spouseRelationships[0].children.length).toBe(1);
  });

  test('layout save and load', async () => {
    const layoutData = { nodes: [{ id: 1, x: 100, y: 100 }] };
    const saveRes = await request(app).post('/api/layout').send(layoutData);
    expect(saveRes.statusCode).toBe(201);

    const getRes = await request(app).get('/api/layout');
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.nodes[0].x).toBe(100);
  });

  test('handles empty parent IDs as null', async () => {
    await request(app).post('/api/people').send({
      firstName: 'Parent',
      lastName: 'One',
    });
    const createRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Child', lastName: 'One', fatherId: 1 });
    expect(createRes.statusCode).toBe(201);

    const updateRes = await request(app)
      .put(`/api/people/${createRes.body.id}`)
      .send({ fatherId: '' });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.fatherId).toBeNull();
  });

  test('supports approximate dates', async () => {
    const res = await request(app)
      .post('/api/people')
      .send({ firstName: 'Approx', lastName: 'Date', birthApprox: 'ABT 1900' });
    expect(res.statusCode).toBe(201);
    expect(res.body.birthApprox).toBe('ABT 1900');
    const getRes = await request(app).get(`/api/people/${res.body.id}`);
    expect(getRes.body.birthApprox).toBe('ABT 1900');
  });

  test('rejects invalid spouse relationships', async () => {
    await sequelize.sync({ force: true });
    await request(app).post('/api/people').send({ firstName: 'A', lastName: 'B' });
    await request(app).post('/api/people').send({ firstName: 'C', lastName: 'D' });

    const selfRes = await request(app)
      .post('/api/people/1/spouses')
      .send({ spouseId: 1 });
    expect(selfRes.statusCode).toBe(400);

    const first = await request(app)
      .post('/api/people/1/spouses')
      .send({ spouseId: 2 });
    expect(first.statusCode).toBe(201);

    const dupRes = await request(app)
      .post('/api/people/2/spouses')
      .send({ spouseId: 1 });
    expect(dupRes.statusCode).toBe(400);
  });

  test('exports and imports database', async () => {
    await sequelize.sync({ force: true });
    await request(app).post('/api/people').send({ firstName: 'A', lastName: 'B' });
    await request(app).post('/api/people').send({ firstName: 'C', lastName: 'D' });
    await request(app).post('/api/people/1/spouses').send({ spouseId: 2 });
    await request(app).post('/api/layout').send({ nodes: [{ id: 1 }] });

    const exportRes = await request(app).get('/api/export/db');
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.body.people.length).toBe(2);

    await request(app).post('/api/people').send({ firstName: 'X', lastName: 'Y' });
    const importRes = await request(app).post('/api/import/db').send(exportRes.body);
    expect(importRes.statusCode).toBe(204);

    const peopleRes = await request(app).get('/api/people');
    expect(peopleRes.body.length).toBe(2);
    const spouseRes = await request(app).get('/api/people/1/spouses');
    expect(spouseRes.body.length).toBe(1);
    const layoutRes = await request(app).get('/api/layout');
    expect(layoutRes.body.nodes[0].id).toBe(1);
  });

  test('place suggestions route returns data', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          geonames: [
            {
              geonameId: 1,
              name: 'Test',
              adminName1: 'X',
              countryCode: 'US',
              lat: '0',
              lng: '0',
              score: 1,
              fcode: 'PPL',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ postalCodes: [{ postalCode: '12345' }] }),
      });
    const res = await request(app).get('/places/suggest?q=Dup');
    expect(res.statusCode).toBe(200);
    expect(res.body[0].name).toBe('Test');
    expect(res.body[0].postalCode).toBe('12345');
  });

  test('place suggestions deduplicate identical entries', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          geonames: [
            {
              geonameId: 1,
              name: 'Test',
              adminName1: 'X',
              countryCode: 'US',
              lat: '0',
              lng: '0',
              score: 1,
              fcode: 'PPL',
            },
            {
              geonameId: 1,
              name: 'Test',
              adminName1: 'X',
              countryCode: 'US',
              lat: '0',
              lng: '0',
              score: 1,
              fcode: 'PPL',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ postalCodes: [{ postalCode: '12345' }] }),
      });
    const res = await request(app).get('/places/suggest?q=Test');
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('place suggestions normalize dash characters', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ geonames: [] }) });
    global.fetch = fetchMock;
    const res = await request(app)
      .get('/places/suggest')
      .query({ q: 'Foo\u2013Bar' });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain('q=Foo%2DBar');
  });

  test('place suggestions encode umlauts correctly', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ geonames: [] }) });
    global.fetch = fetchMock;
    const res = await request(app)
      .get('/places/suggest')
      .query({ q: 'M\u00fcnchen' });
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain('q=M%C3%BCnchen');
  });
});
