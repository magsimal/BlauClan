const { parseGedcom } = require('../src/utils/gedcom');

describe('parseGedcom', () => {
  test('parses simple individual', () => {
    const text = '0 @I1@ INDI\n1 NAME Anna /Smith/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 1900';
    const res = parseGedcom(text);
    expect(res.people).toHaveLength(1);
    expect(res.people[0].gedcomId).toBe('@I1@');
    expect(res.people[0].firstName).toBe('Anna');
    expect(res.people[0].lastName).toBe('Smith');
    expect(res.people[0].gender).toBe('female');
    expect(res.people[0].dateOfBirth).toBe('1900-01-01');
  });

  test('handles approximate date', () => {
    const text = '0 @I1@ INDI\n1 NAME Bob /Jones/\n1 BIRT\n2 DATE ABT 1800';
    const { people } = parseGedcom(text);
    const p = people[0];
    expect(p.birthApprox).toBe('ABT 1800');
    expect(p.dateOfBirth).toBeUndefined();
  });

  test('parses family relationships', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n0 @I2@ INDI\n1 NAME C /D/\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 MARR\n2 DATE 13 APR 1706\n2 PLAC Graben';
    const { families } = parseGedcom(text);
    expect(families).toHaveLength(1);
    const fam = families[0];
    expect(fam.husband).toBe('@I1@');
    expect(fam.wife).toBe('@I2@');
    expect(fam.date).toBe('1706-04-13');
    expect(fam.place).toBe('Graben');
  });
});
