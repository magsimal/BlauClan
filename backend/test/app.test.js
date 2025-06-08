process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const app = require('../src/index');
const sequelize = require('../src/models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('People API', () => {
  test('GET /api/people returns empty array', async () => {
    const res = await request(app).get('/api/people');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/people creates a person', async () => {
    const res = await request(app)
      .post('/api/people')
      .send({ firstName: 'John', lastName: 'Doe' });
    expect(res.statusCode).toBe(201);
    expect(res.body.firstName).toBe('John');

    const list = await request(app).get('/api/people');
    expect(list.body.length).toBe(1);
  });
});
