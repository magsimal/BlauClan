const { parseGedcom } = require('../src/utils/gedcom');

describe('parseGedcom', () => {
  test('parses simple individual', () => {
    const text = '0 @I1@ INDI\n1 NAME Anna /Smith/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 1900';
    const people = parseGedcom(text);
    expect(people).toHaveLength(1);
    expect(people[0].firstName).toBe('Anna');
    expect(people[0].lastName).toBe('Smith');
    expect(people[0].gender).toBe('female');
    expect(people[0].dateOfBirth).toBe('1900-01-01');
  });

  test('handles approximate date', () => {
    const text = '0 @I1@ INDI\n1 NAME Bob /Jones/\n1 BIRT\n2 DATE ABT 1800';
    const [p] = parseGedcom(text);
    expect(p.birthApprox).toBe('ABT 1800');
    expect(p.dateOfBirth).toBeUndefined();
  });
});
