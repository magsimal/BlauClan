/** @jest-environment jsdom */

let SearchApp;

describe('SearchApp', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({
      json: () => [
        { id: 1, firstName: 'John', lastName: 'Doe' },
        { id: 2, firstName: 'Jane', lastName: 'Smith' },
      ],
    });
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
    await SearchApp.init();
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

  test('show and hide control visibility', () => {
    const overlay = document.getElementById('search-overlay');
    SearchApp.show();
    expect(overlay.style.display).toBe('flex');
    SearchApp.hide();
    expect(overlay.style.display).toBe('none');
  });
});

