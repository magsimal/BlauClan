module.exports = [
  {
    desc: 'gender mismatch should not match',
    person: { firstName: 'Anna', lastName: 'Doe', gender: 'F' },
    existing: [{ id: 1, firstName: 'Anna', lastName: 'Doe', gender: 'M' }],
    shouldMatch: false,
  },
  {
    desc: 'Martha and Marta with same last name should match',
    person: { firstName: 'Martha', lastName: 'Smith', gender: 'F' },
    existing: [{ id: 1, firstName: 'Marta', lastName: 'Smith', gender: 'F' }],
    shouldMatch: true,
  },
  {
    desc: 'John and Jonathan with same last name should not match',
    person: { firstName: 'John', lastName: 'Smith', gender: 'M' },
    existing: [{ id: 1, firstName: 'Jonathan', lastName: 'Smith', gender: 'M' }],
    shouldMatch: false,
  },
  {
    desc: 'same last name only should not match',
    person: { firstName: 'Alice', lastName: 'Doe', gender: 'F' },
    existing: [{ id: 1, firstName: 'Eve', lastName: 'Doe', gender: 'F' }],
    shouldMatch: false,
  },
  {
    desc: 'different second given name should not match',
    person: { firstName: 'Eva Christina', lastName: 'Doe' },
    existing: [{ id: 1, firstName: 'Eva Cathrine', lastName: 'Doe' }],
    shouldMatch: false,
  },
  {
    desc: 'conflicting birth years should not match',
    person: { firstName: 'John', lastName: 'Doe', dateOfBirth: '1980-01-01' },
    existing: [{ id: 1, firstName: 'John', lastName: 'Doe', dateOfBirth: '1920-01-01' }],
    shouldMatch: false,
  },
  {
    desc: 'conflicting death years should not match',
    person: { firstName: 'Bob', lastName: 'Doe', dateOfDeath: '2000-01-01' },
    existing: [{ id: 1, firstName: 'Bob', lastName: 'Doe', dateOfDeath: '1900-01-01' }],
    shouldMatch: false,
  },
  {
    desc: 'conflicting place of birth should not match',
    person: { firstName: 'Jane', lastName: 'Doe', placeOfBirth: 'Berlin' },
    existing: [{ id: 1, firstName: 'Jane', lastName: 'Doe', placeOfBirth: 'Paris' }],
    shouldMatch: false,
  },
  {
    desc: 'Köln vs Cologne considered duplicate',
    person: { firstName: 'Hans', lastName: 'Schmidt', placeOfBirth: 'Köln, Deutschland' },
    existing: [{ id: 1, firstName: 'Hans', lastName: 'Schmidt', placeOfBirth: 'Cologne, Germany' }],
    shouldMatch: true,
  },
  {
    desc: 'Frankfurt abbreviations are equivalent',
    person: { firstName: 'Anna', lastName: 'Müller', placeOfBirth: 'Frankfurt a. M.' },
    existing: [{ id: 1, firstName: 'Anna', lastName: 'Müller', placeOfBirth: 'Frankfurt am Main' }],
    shouldMatch: true,
  },
  {
    desc: 'far apart birth years not duplicate',
    person: { firstName: 'Max', lastName: 'Doe', placeOfBirth: 'Berlin', dateOfBirth: '1920-01-01' },
    existing: [{ id: 1, firstName: 'Max', lastName: 'Doe', placeOfBirth: 'Berlin', dateOfBirth: '1980-01-01' }],
    shouldMatch: false,
  },
  {
    desc: 'approximate birth year within range considered duplicate',
    person: { firstName: 'Karl', lastName: 'Maier', birthApprox: 'circa 1920' },
    existing: [{ id: 1, firstName: 'Karl', lastName: 'Maier', dateOfBirth: '1921-01-01' }],
    shouldMatch: true,
  },
];
