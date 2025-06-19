const fs = require('fs');
const path = require('path');

describe('index.html scripts', () => {
  test('includes required script tags', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const scripts = [
      'app.js',
      'src/utils/exportSvg.js',
      'src/utils/assignGenerations.js',
      'src/utils/gedcom.js',
      'src/utils/dedup.js',
      'src/config.js',
      'flow.js',
      'search.js',
    ];
    scripts.forEach((src) => {
      expect(html).toContain(`<script src="${src}"></script>`);
    });
  });
});
