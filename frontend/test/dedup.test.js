const { findBestMatch, matchScore } = require('../src/utils/dedup');

describe('deduplication utils', () => {
  test('findBestMatch chooses closest match', () => {
    const existing = [
      { id: 1, firstName: 'Johann', lastName: 'Schmidt', dateOfBirth: '1900-01-01' },
      { id: 2, firstName: 'John', lastName: 'Smith', dateOfBirth: '1900-01-02' },
    ];
    const person = { firstName: 'John', lastName: 'Smith', dateOfBirth: '1900-01-01', placeOfBirth: 'Berlin' };
    const { match } = findBestMatch(person, existing);
    expect(match.id).toBe(2);
  });

  test('matchScore higher for close names', () => {
    const a = { firstName: 'Anna', lastName: 'Miller', dateOfBirth: '1880-01-01' };
    const b = { firstName: 'Ana', lastName: 'Miller', dateOfBirth: '1880-01-01' };
    const c = { firstName: 'Beth', lastName: 'Jones', dateOfBirth: '1880-01-01' };
    expect(matchScore(a, b)).toBeGreaterThan(matchScore(a, c));
  });

  test('single fuzzy attribute does not trigger match', () => {
    const existing = [
      { id: 1, firstName: 'John', lastName: 'Smith', dateOfBirth: '1900-01-01', placeOfBirth: 'Berlin' },
    ];
    const person = { firstName: 'Jon', lastName: 'Doe' };
    const { match } = findBestMatch(person, existing);
    expect(match).toBe(null);
  });
});
