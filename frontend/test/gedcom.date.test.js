/** @jest-environment jsdom */
const { parseGedcom } = require('../src/utils/gedcom');

// Access toIso via a small harness since it's internal; use parseGedcom DATE behavior instead

describe('GEDCOM toIso edge cases (via parseGedcom)', () => {
  test('parses with lowercase month and extra spaces', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE  2  jan  1999 ';
    const { people } = parseGedcom(text);
    expect(people[0].dateOfBirth).toBe('1999-01-02');
  });

  test('returns approx when not in supported formats', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE about 1890';
    const { people } = parseGedcom(text);
    expect(people[0].birthApprox).toBe('about 1890');
    expect(people[0].dateOfBirth).toBeUndefined();
  });

  test('accepts already ISO formatted date', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE 1988-07-05';
    const { people } = parseGedcom(text);
    expect(people[0].dateOfBirth).toBe('1988-07-05');
  });

  test('invalid month results in approx not iso', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE 12 XYZ 2001';
    const { people } = parseGedcom(text);
    expect(people[0].birthApprox).toBe('12 XYZ 2001');
    expect(people[0].dateOfBirth).toBeUndefined();
  });
});