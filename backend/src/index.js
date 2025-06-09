const express = require('express');
const { sequelize, Person, Marriage } = require('./models');
const { Op } = require('sequelize');

const app = express();
app.use(express.json());

app.get('/api/people', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

app.post('/api/people', async (req, res) => {
  try {
    const person = await Person.create(req.body);
    res.status(201).json(person);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/people/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  res.json(person);
});

app.put('/api/people/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  await person.update(req.body);
  res.json(person);
});

app.delete('/api/people/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  await person.destroy();
  res.sendStatus(204);
});

// Spouse management
app.get('/api/people/:id/spouses', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const marriages = await Marriage.findAll({
    where: {
      [Op.or]: [{ personId: id }, { spouseId: id }],
    },
  });
  const result = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (spouse) {
      result.push({ marriageId: m.id, dateOfMarriage: m.dateOfMarriage, spouse });
    }
  }
  res.json(result);
});

app.post('/api/people/:id/spouses', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const spouseId = parseInt(req.body.spouseId, 10);
    if (Number.isNaN(spouseId)) return res.status(400).json({ error: 'Invalid spouseId' });
    const marriage = await Marriage.create({
      personId: id,
      spouseId,
      dateOfMarriage: req.body.dateOfMarriage,
    });
    res.status(201).json(marriage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/people/:id/spouses/:marriageId', async (req, res) => {
  const marriageId = parseInt(req.params.marriageId, 10);
  if (Number.isNaN(marriageId)) return res.status(400).json({ error: 'Invalid marriageId' });
  const marriage = await Marriage.findByPk(marriageId);
  if (!marriage) return res.sendStatus(404);
  await marriage.destroy();
  res.sendStatus(204);
});

async function buildAncestors(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  node.father = null;
  node.mother = null;
  if (person.fatherId) {
    node.father = await buildAncestors(person.fatherId);
  }
  if (person.motherId) {
    node.mother = await buildAncestors(person.motherId);
  }
  return node;
}

async function buildDescendants(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  const marriages = await Marriage.findAll({
    where: {
      [Op.or]: [{ personId: id }, { spouseId: id }],
    },
  });
  node.spouseRelationships = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (!spouse) continue;
    const children = await Person.findAll({
      where: {
        [Op.or]: [
          { fatherId: id, motherId: spouseId },
          { fatherId: spouseId, motherId: id },
        ],
      },
    });
    const childNodes = [];
    for (const child of children) {
      childNodes.push(await buildDescendants(child.id));
    }
    node.spouseRelationships.push({
      spouse: spouse.toJSON(),
      dateOfMarriage: m.dateOfMarriage,
      children: childNodes,
    });
  }
  return node;
}

app.get('/api/tree/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { type = 'both' } = req.query;
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const result = { id: person.id };
  if (type === 'ancestors' || type === 'both') {
    result.ancestors = await buildAncestors(person.id);
  }
  if (type === 'descendants' || type === 'both') {
    result.descendants = await buildDescendants(person.id);
  }
  res.json(result);
});

app.get('/api/export/json', async (req, res) => {
  const { filter } = req.query;
  if (filter) {
    const id = parseInt(filter, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid filter' });
    const tree = await buildDescendants(id);
    res.json(tree);
  } else {
    const people = await Person.findAll();
    res.json(people);
  }
});

const PORT = process.env.PORT || 3009;
if (require.main === module) {
  sequelize.sync().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

module.exports = app;
