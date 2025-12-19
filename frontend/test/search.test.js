/** @jest-environment jsdom */

let SearchApp;

describe('SearchApp', () => {
  beforeEach(async () => {
    jest.resetModules();
    const people = [
      {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1900-01-01',
        dateOfDeath: '1980-01-01',
      },
      {
        id: 2,
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1905-05-10',
        dateOfDeath: '1990-05-10',
      },
    ];
    global.Fuse = class {
      constructor(list) {
        this.list = list;
      }
      search(q, opts = {}) {
        return this.list
          .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.toLowerCase()))
          .slice(0, opts.limit)
          .map((item) => ({ item }));
      }
    };
    SearchApp = require('../search.js');
    document.body.innerHTML = '';
    await SearchApp.init({ people });
  });

  test('creates overlay and populates results', () => {
    const overlay = document.getElementById('search-overlay');
    expect(overlay).toBeTruthy();
    const input = overlay.querySelector('#search-input');
    input.value = 'Jane';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const results = overlay.querySelectorAll('li');
    expect(results.length).toBe(1);
    expect(results[0].textContent).toContain('Jane Smith');
  });

  test('displays birth and death dates when available', () => {
    const overlay = document.getElementById('search-overlay');
    const input = overlay.querySelector('#search-input');
    input.value = 'John';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const result = overlay.querySelector('li');
    expect(result.innerHTML).toContain('1900-01-01');
    expect(result.innerHTML).toContain('1980-01-01');
  });

  test('show and hide control visibility', () => {
    const overlay = document.getElementById('search-overlay');
    SearchApp.show();
    expect(overlay.style.display).toBe('flex');
    SearchApp.hide();
    expect(overlay.style.display).toBe('none');
  });
});

