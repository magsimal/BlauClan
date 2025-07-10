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
];
