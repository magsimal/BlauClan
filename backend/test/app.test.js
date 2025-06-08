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
});
