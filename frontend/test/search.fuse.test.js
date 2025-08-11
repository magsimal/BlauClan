/** @jest-environment jsdom */

describe('Search with/without Fuse', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
  });

  test('works without Fuse by not crashing and showing no results', async () => {
    // No global.Fuse
    global.fetch = jest.fn().mockResolvedValue({ json: () => [] });
    const SearchApp = require('../search.js');
    await SearchApp.init();
    const overlay = document.getElementById('search-overlay');
    const input = overlay.querySelector('#search-input');
    input.value = 'anything';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const results = overlay.querySelectorAll('li');
    expect(results.length).toBe(0);
  });

  test('works with Fuse and returns matches', async () => {
    global.fetch = jest.fn().mockResolvedValue({ json: () => [{ id: 1, firstName: 'Alpha', lastName: 'Beta' }] });
    global.Fuse = class { constructor(list){ this.list=list; } search(q){ return this.list.filter(p => (p.firstName+" "+p.lastName).toLowerCase().includes(q.toLowerCase())).map(item=>({item})); } };
    const SearchApp = require('../search.js');
    await SearchApp.init();
    const overlay = document.getElementById('search-overlay');
    const input = overlay.querySelector('#search-input');
    input.value = 'alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const results = overlay.querySelectorAll('li');
    expect(results.length).toBe(1);
    expect(results[0].textContent).toContain('Alpha Beta');
  });
});