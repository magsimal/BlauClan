const fs = require('fs');
const path = require('path');
const { sequelize, Person, Marriage } = require('./models');

async function loadData() {
  const dataPath = path.join(__dirname, '../sample-data.json');
  const people = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  await sequelize.sync({ force: true });
  for (const p of people) {
    await Person.create(p);
  }
  // simple marriage between John (1) and Jane (2)
  await Marriage.create({ personId: 1, spouseId: 2, dateOfMarriage: '2000-01-01' });
  await sequelize.close();
}

if (require.main === module) {
  loadData().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = loadData;
