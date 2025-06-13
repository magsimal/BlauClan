const express = require('express');
const { sequelize, Person, Marriage, Layout } = require('./models');
const { Op } = require('sequelize');

const app = express();
app.use(express.json());

app.get('/api/people', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

function normalizeParentIds(data) {
  const updates = { ...data };
  ['fatherId', 'motherId'].forEach((field) => {
    if (updates[field] === '') updates[field] = null;
  });
  return updates;
}

app.post('/api/people', async (req, res) => {
  try {
    const payload = normalizeParentIds(req.body);
    const person = await Person.create(payload);
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
  const updates = normalizeParentIds(req.body);
  await person.update(updates);
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

app.get('/api/export/db', async (_req, res) => {
  const [people, marriages, layouts] = await Promise.all([
    Person.findAll(),
    Marriage.findAll(),
    Layout.findAll(),
  ]);
  res.json({ people, marriages, layouts });
});

app.post('/api/import/db', async (req, res) => {
  try {
    const { people = [], marriages = [], layouts = [] } = req.body;
    await sequelize.transaction(async (t) => {
      await Marriage.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      await Person.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      await Layout.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
      if (people.length) await Person.bulkCreate(people, { transaction: t });
      if (marriages.length) await Marriage.bulkCreate(marriages, { transaction: t });
      if (layouts.length) await Layout.bulkCreate(layouts, { transaction: t });
    });
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Layout endpoints
app.post('/api/layout', async (req, res) => {
  try {
    const layout = await Layout.create({ data: req.body });
    res.status(201).json(layout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/layout', async (_req, res) => {
  const layout = await Layout.findOne({ order: [['createdAt', 'DESC']] });
  if (!layout) return res.json(null);
  res.json(layout.data);
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
