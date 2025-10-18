process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.USE_PROXY_AUTH = 'true';
process.env.TRUSTED_PROXY_IPS = '::1,127.0.0.1';

const request = require('supertest');
const app = require('../src/index');
const { sequelize, Marriage } = require('../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await app.sessionStore.sync();
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
    expect(treeRes.body.descendants.childCount).toBe(1);
    expect(treeRes.body.descendants.ancestryDepth).toBe(0);
    const spouse = treeRes.body.descendants.spouseRelationships[0].spouse;
    expect(spouse.childCount).toBe(1);
    const childNode = treeRes.body.descendants.spouseRelationships[0].children[0];
    expect(childNode.ancestryDepth).toBe(1);

    const segmentRes = await request(app).get('/api/tree/1/segment?type=descendants&maxDepth=1');
    expect(segmentRes.statusCode).toBe(200);
    expect(segmentRes.body.rootId).toBe(1);
    expect(segmentRes.body.type).toBe('descendants');
    const segmentPeople = segmentRes.body.people;
    expect(Array.isArray(segmentPeople)).toBe(true);
    const ids = segmentPeople.map((entry) => entry.person.id);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
    const rootEntry = segmentPeople.find((entry) => entry.person.id === 1);
    expect(rootEntry.hints.hasMoreDescendants).toBe(true);
    const childEntry = segmentPeople.find((entry) => entry.person.id === 3);
    expect(childEntry.hints.hasMoreDescendants).toBe(true);

    const listRes = await request(app).get('/api/people');
    expect(listRes.statusCode).toBe(200);
    const john = listRes.body.find((p) => p.id === 1);
    const jane = listRes.body.find((p) => p.id === 2);
    const child = listRes.body.find((p) => p.id === 3);
    expect(john.childCount).toBe(1);
    expect(john.ancestryDepth).toBe(0);
    expect(jane.childCount).toBe(1);
    expect(jane.ancestryDepth).toBe(0);
    expect(child.childCount).toBe(0);
    expect(child.ancestryDepth).toBe(1);
  });

  test('descendant segment flags boundary children when deeper descendants exist', async () => {
    await sequelize.sync({ force: true });

    const rootRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Boundary', lastName: 'Root' });

    const childRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Boundary', lastName: 'Child', fatherId: rootRes.body.id });

    const grandchildRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Boundary', lastName: 'Grandchild', fatherId: childRes.body.id });

    const segmentRes = await request(app)
      .get(`/api/tree/${rootRes.body.id}/segment?type=descendants&maxDepth=1`);
    expect(segmentRes.statusCode).toBe(200);

    const people = segmentRes.body.people;
    const rootEntry = people.find((entry) => entry.person.id === rootRes.body.id);
    expect(rootEntry).toBeDefined();
    expect(rootEntry.hints.hasMoreDescendants).toBe(true);

    const childEntry = people.find((entry) => entry.person.id === childRes.body.id);
    expect(childEntry).toBeDefined();
    expect(childEntry.hints.hasMoreDescendants).toBe(true);

    const grandchildEntry = people.find((entry) => entry.person.id === grandchildRes.body.id);
    expect(grandchildEntry).toBeUndefined();
  });

  test('descendant segment marks missing ancestor hints for spouses and descendants', async () => {
    await sequelize.sync({ force: true });

    const spouseFatherRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Partner', lastName: 'Father' });
    const spouseMotherRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Partner', lastName: 'Mother' });

    const rootRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Root', lastName: 'Person' });
    const spouseRes = await request(app)
      .post('/api/people')
      .send({
        firstName: 'Partner',
        lastName: 'Person',
        fatherId: spouseFatherRes.body.id,
        motherId: spouseMotherRes.body.id,
      });

    await request(app).post(`/api/people/${rootRes.body.id}/spouses`).send({ spouseId: spouseRes.body.id });

    const childRes = await request(app)
      .post('/api/people')
      .send({
        firstName: 'Child',
        lastName: 'Person',
        fatherId: rootRes.body.id,
        motherId: spouseRes.body.id,
      });

    const childSpouseFatherRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'InLaw', lastName: 'Senior' });
    const childSpouseRes = await request(app)
      .post('/api/people')
      .send({
        firstName: 'InLaw',
        lastName: 'Junior',
        fatherId: childSpouseFatherRes.body.id,
      });

    await request(app)
      .post(`/api/people/${childRes.body.id}/spouses`)
      .send({ spouseId: childSpouseRes.body.id });

    const segmentRes = await request(app).get(
      `/api/tree/${rootRes.body.id}/segment?type=descendants&maxDepth=1`
    );
    expect(segmentRes.statusCode).toBe(200);

    const people = segmentRes.body.people;
    const spouseEntry = people.find((entry) => entry.person.id === spouseRes.body.id);
    expect(spouseEntry).toBeDefined();
    expect(spouseEntry.hints.hasMoreAncestors).toBe(true);

    const childEntry = people.find((entry) => entry.person.id === childRes.body.id);
    expect(childEntry).toBeDefined();
    expect(childEntry.hints.hasMoreAncestors).toBe(false);

    const childSpouseEntry = people.find((entry) => entry.person.id === childSpouseRes.body.id);
    expect(childSpouseEntry).toBeDefined();
    expect(childSpouseEntry.hints.hasMoreAncestors).toBe(true);
  });

  test('descendant segment merges hints for repeated descendants across branches', async () => {
    await sequelize.sync({ force: true });

    const createdPeople = [];
    const createPerson = async (payload) => {
      const res = await request(app).post('/api/people').send(payload);
      expect(res.statusCode).toBe(201);
      createdPeople.push(res.body);
      return res.body;
    };

    const root = await createPerson({ firstName: 'Converging', lastName: 'Root' });
    const spouseA = await createPerson({ firstName: 'Branch', lastName: 'Alpha' });
    const spouseB = await createPerson({ firstName: 'Branch', lastName: 'Beta' });

    const leftParent = await createPerson({
      firstName: 'Left',
      lastName: 'Parent',
      fatherId: root.id,
      motherId: spouseA.id,
    });
    const rightParent = await createPerson({
      firstName: 'Right',
      lastName: 'Parent',
      fatherId: root.id,
      motherId: spouseB.id,
    });

    const convergingDescendant = await createPerson({
      firstName: 'Shared',
      lastName: 'Descendant',
      fatherId: leftParent.id,
      motherId: rightParent.id,
    });

    let currentAncestor = convergingDescendant;
    const chainLength = 94;
    for (let i = 0; i < chainLength; i += 1) {
      currentAncestor = await createPerson({
        firstName: `Chain${i}`,
        lastName: 'Descendant',
        fatherId: currentAncestor.id,
      });
    }

    expect(createdPeople.length).toBe(100);

    const segmentRes = await request(app).get(
      `/api/tree/${root.id}/segment?type=descendants&maxDepth=2`,
    );
    expect(segmentRes.statusCode).toBe(200);

    const sharedEntry = segmentRes.body.people.find(
      (entry) => entry.person.id === convergingDescendant.id,
    );
    expect(sharedEntry).toBeDefined();
    expect(sharedEntry.hints.hasMoreDescendants).toBe(true);
  });

  test('descendant tree groups children without complete parent data', async () => {
    await sequelize.sync({ force: true });

    const parentRes = await request(app).post('/api/people').send({ firstName: 'Solo', lastName: 'Parent' });
    const partnerRes = await request(app).post('/api/people').send({ firstName: 'Co', lastName: 'Parent' });
    const childWithPartnerRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Partnered', lastName: 'Child', fatherId: parentRes.body.id, motherId: partnerRes.body.id });
    const childWithoutPartnerRes = await request(app)
      .post('/api/people')
      .send({ firstName: 'Solo', lastName: 'Child', fatherId: parentRes.body.id });

    const treeRes = await request(app).get(`/api/tree/${parentRes.body.id}?type=descendants`);
    expect(treeRes.statusCode).toBe(200);
    const relationships = treeRes.body.descendants.spouseRelationships;
    expect(Array.isArray(relationships)).toBe(true);

    const knownPartnerRel = relationships.find((rel) => rel.spouse && rel.spouse.id === partnerRes.body.id);
    expect(knownPartnerRel).toBeDefined();
    expect(knownPartnerRel.children.map((child) => child.id)).toContain(childWithPartnerRes.body.id);

    const fallbackRel = relationships.find((rel) => rel.spouse === null);
    expect(fallbackRel).toBeDefined();
    expect(fallbackRel.children.map((child) => child.id)).toContain(childWithoutPartnerRes.body.id);
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

  test('stores geoname ID', async () => {
    const res = await request(app)
      .post('/api/people')
      .send({ firstName: 'Geo', lastName: 'Test', geonameId: 42, placeOfBirth: 'Munich' });
    expect(res.statusCode).toBe(201);
    expect(res.body.geonameId).toBe(42);
    const getRes = await request(app).get(`/api/people/${res.body.id}`);
    expect(getRes.body.geonameId).toBe(42);
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

  test('imports benchmark generator output with person/spouse IDs', async () => {
    await sequelize.sync({ force: true });
    const dataset = require('../large-test-data-100.json');

    const importRes = await request(app).post('/api/import/db').send(dataset);
    expect(importRes.statusCode).toBe(204);

    const peopleRes = await request(app).get('/api/people');
    expect(peopleRes.statusCode).toBe(200);
    expect(peopleRes.body.length).toBe(dataset.people.length);

    const marriageCount = await Marriage.count();
    expect(marriageCount).toBe(dataset.marriages.length);

    const sampleMarriage = dataset.marriages[0];
    if (sampleMarriage) {
      const spouseRes = await request(app).get(`/api/people/${sampleMarriage.personId}/spouses`);
      expect(spouseRes.statusCode).toBe(200);
      const spouseIds = spouseRes.body.map((entry) => entry.spouse?.id).filter(Boolean);
      expect(spouseIds).toContain(sampleMarriage.spouseId);
    }
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
    expect(global.fetch.mock.calls[0][0]).toContain('name_startsWith=Dup');
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
    expect(global.fetch.mock.calls[0][0]).toContain('q=Test');
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

  test('records activity with points', async () => {
    await sequelize.sync({ force: true });
    await request(app).post('/api/people').send({ firstName: 'Log', lastName: 'Test' });
    await request(app).put('/api/people/1').send({ lastName: 'Updated' });
    const res = await request(app).get('/api/activity');
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(2);
    const points = res.body.map((r) => r.points).sort();
    expect(points).toEqual([1, 5]);
  });

  test('creates session from proxy headers', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('X-Forwarded-For', '127.0.0.1')
      .set('Remote-User', 'proxyUser')
      .set('Remote-Groups', 'familytree_user')
      .set('Remote-Email', 'proxy@example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body.username).toBe('proxyUser');
    expect(res.body.email).toBe('proxy@example.com');
  });

  test('ignores proxy headers from untrusted IP', async () => {
    jest.resetModules();
    process.env.TRUSTED_PROXY_IPS = '192.168.0.1';
    const untrustedApp = require('../src/index');
    const res = await request(untrustedApp)
      .get('/api/me')
      .set('X-Forwarded-For', '8.8.8.8')
      .set('Remote-User', 'proxyUser')
      .set('Remote-Groups', 'familytree_user')
      .set('Remote-Email', 'proxy@example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body.username).toBe('guest');
  });
});
