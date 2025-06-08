const { fetchPeople, createPerson } = require('../app');

describe('frontend helpers', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('fetchPeople returns list', async () => {
    global.fetch.mockResolvedValue({ json: () => [{ id: 1, firstName: 'John', lastName: 'Doe' }] });
    const data = await fetchPeople();
    expect(global.fetch).toHaveBeenCalledWith('/api/people');
    expect(data).toHaveLength(1);
  });

  test('createPerson posts data', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => ({ id: 2, firstName: 'Jane' }) });
    const person = await createPerson({ firstName: 'Jane' });
    expect(global.fetch).toHaveBeenCalled();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/people');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).firstName).toBe('Jane');
    expect(person.id).toBe(2);
  });
});
