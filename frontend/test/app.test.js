/** @jest-environment jsdom */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const FrontendApp = require('../app');
const {
  fetchPeople,
  createPerson,
  updatePerson,
  deletePerson,
  linkSpouse,
  fetchSpouses,
  deleteSpouse,
  parentName,
  mountApp,
} = FrontendApp;

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

  test('deletePerson deletes data', async () => {
    global.fetch.mockResolvedValue({ ok: true });
    await deletePerson(3);
    expect(global.fetch).toHaveBeenCalledWith('/api/people/3', { method: 'DELETE' });
  });

  test('linkSpouse posts relationship', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => ({ id: 1 }) });
    await linkSpouse(1, 2, { dateOfMarriage: '2000-01-01', placeOfMarriage: 'X' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/people/1/spouses',
      expect.objectContaining({ method: 'POST' })
    );
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.placeOfMarriage).toBe('X');
    expect(body.dateOfMarriage).toBe('2000-01-01');
  });

  test('fetchSpouses gets list', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => [{ spouse: { id: 2 } }] });
    const data = await fetchSpouses(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/people/1/spouses');
    expect(data[0].spouse.id).toBe(2);
  });

  test('deleteSpouse sends DELETE', async () => {
    global.fetch.mockResolvedValue({ ok: true });
    await deleteSpouse(1, 10);
    expect(global.fetch).toHaveBeenCalledWith('/api/people/1/spouses/10', { method: 'DELETE' });
  });

  test('updatePerson sends PUT', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => ({ id: 5, firstName: 'Bob' }) });
    const result = await updatePerson(5, { firstName: 'Bob' });
    expect(global.fetch).toHaveBeenCalledWith('/api/people/5', expect.objectContaining({ method: 'PUT' }));
    expect(result.firstName).toBe('Bob');
  });

  test('updatePerson throws on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await expect(updatePerson(1, {})).rejects.toThrow('Failed to update person');
  });

  test('parentName formats correctly', () => {
    const list = [
      { id: 1, firstName: 'A', callName: 'Al', lastName: 'B' },
      { id: 2, firstName: 'C', lastName: 'D' },
    ];
    expect(parentName(1, list)).toBe('Al (A) B');
    expect(parentName(2, list)).toBe('C D');
    expect(parentName(3, list)).toBe('');
  });

  test('mountApp loads people', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const sandbox = {
      window,
      document,
      navigator,
      console,
      SVGElement: window.SVGElement,
      Element: window.Element,
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../vue.global.js'), 'utf8'), sandbox);
    global.Vue = sandbox.Vue;

    global.fetch.mockResolvedValue({ json: () => [{ id: 1, firstName: 'X', lastName: 'Y' }] });
    const vmApp = mountApp();
    await sandbox.Vue.nextTick();
    expect(global.fetch).toHaveBeenCalledWith('/api/people');
    expect(vmApp.people).toHaveLength(1);

    delete global.Vue;
  });
});
