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
});
