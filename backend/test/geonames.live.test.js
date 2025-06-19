describe('GeoNames API', () => {
  test('demo account returns results', async () => {
    const url = 'http://api.geonames.org/searchJSON?q=london&maxRows=10&username=demo';
    const res = await globalThis.fetch(url);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.geonames)).toBe(true);
    expect(data.geonames.length).toBeGreaterThan(0);
  });
});
