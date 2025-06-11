const { assignGenerations } = require('../src/utils/assignGenerations');

describe('assignGenerations', () => {
  test('computes generation numbers', () => {
    const persons = [
      { id: 'a', spouseIds: ['b'] },
      { id: 'b', fatherId: 'c', motherId: 'd', spouseIds: ['a'] },
      { id: 'c', spouseIds: ['d'] },
      { id: 'd', spouseIds: ['c'] },
      { id: 'e', fatherId: 'a', motherId: 'b', spouseIds: [] },
    ];
    const gen = assignGenerations(persons);
    expect(gen.get('c')).toBe(0);
    expect(gen.get('d')).toBe(0);
    expect(gen.get('a')).toBe(1);
    expect(gen.get('b')).toBe(1);
    expect(gen.get('e')).toBe(2);
  });

  test('available on window when loaded via script tag', () => {
    const fs = require('fs');
    const vm = require('vm');
    const code = fs.readFileSync(require.resolve('../src/utils/assignGenerations.js'), 'utf8');
    const sandbox = { window: {}, console };
    vm.runInNewContext(code, sandbox);
    const api = sandbox.GenerationLayout || sandbox.window.GenerationLayout;
    expect(typeof api).toBe('object');
    const gen = api.assignGenerations([
      { id: 'x', spouseIds: ['y'] },
      { id: 'y', spouseIds: ['x'] },
    ]);
    expect(gen.get('x')).toBe(0);
    expect(gen.get('y')).toBe(0);
  });
});
