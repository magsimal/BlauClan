/** @jest-environment jsdom */
const fs = require('fs');
const vm = require('vm');

describe('exportSvg.js syntax', () => {
  test('file parses without error', () => {
    const code = fs.readFileSync(require.resolve('../src/utils/exportSvg.js'), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });

  test('file contains expected functions', () => {
    const code = fs.readFileSync(require.resolve('../src/utils/exportSvg.js'), 'utf8');
    expect(code).toContain('exportFamilyTree');
    expect(code).toContain('selectedNodeId');
    expect(code).toContain('bloodlineOnly');
  });
});
