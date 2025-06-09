const fs = require('fs');
const vm = require('vm');

describe('flow.js syntax', () => {
  test('file parses without error', () => {
    const code = fs.readFileSync(require.resolve('../flow.js'), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});
