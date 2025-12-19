/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

function extractEnvScript(html) {
  const match = html.match(/<script>\(function\(\)\{[\s\S]*?window\.production=[\s\S]*?\}\)\(\);<\/script>/);
  return match ? match[0].replace(/^<script>|<\/script>$/g, '') : null;
}

describe('Environment detection', () => {
  test('sets development for localhost', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const code = extractEnvScript(html);
    expect(code).toBeTruthy();
    const sandbox = { window: {}, location: { hostname: 'localhost' } };
    const fn = new Function('window','location', code.replace(/\(function\(\)\{/, '').replace(/\}\)\(\);/, ''));
    fn(sandbox.window, sandbox.location);
    expect(sandbox.window.production).toBe('development');
  });

  test('sets production for non-localhost', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const code = extractEnvScript(html);
    const sandbox = { window: {}, location: { hostname: 'example.com' } };
    const fn = new Function('window','location', code.replace(/\(function\(\)\{/, '').replace(/\}\)\(\);/, ''));
    fn(sandbox.window, sandbox.location);
    expect(sandbox.window.production).toBe('production');
  });
});