const express = require('express');
const { sequelize, Person, Marriage, Layout } = require('../models');
const { requireAdmin } = require('../middleware/auth');

async function buildAncestors(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  node.father = null;
  node.mother = null;
  if (person.fatherId) node.father = await buildAncestors(person.fatherId);
  if (person.motherId) node.mother = await buildAncestors(person.motherId);
  return node;
}

async function buildDescendants(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  const marriages = await Marriage.findAll({ where: { [require('sequelize').Op.or]: [{ personId: id }, { spouseId: id }] } });
  node.spouseRelationships = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (!spouse) continue;
    const children = await Person.findAll({ where: { [require('sequelize').Op.or]: [ { fatherId: id, motherId: spouseId }, { fatherId: spouseId, motherId: id } ] } });
    const childNodes = [];
    for (const child of children) {
      childNodes.push(await buildDescendants(child.id));
    }
    node.spouseRelationships.push({
      spouse: spouse.toJSON(),
      dateOfMarriage: m.dateOfMarriage,
      marriageApprox: m.marriageApprox,
      placeOfMarriage: m.placeOfMarriage,
      children: childNodes,
    });
  }
  return node;
}

const router = express.Router();

router.get('/tree/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { type = 'both' } = req.query;
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const result = { id: person.id };
  if (type === 'ancestors' || type === 'both') result.ancestors = await buildAncestors(person.id);
  if (type === 'descendants' || type === 'both') result.descendants = await buildDescendants(person.id);
  res.json(result);
});

router.get('/export/json', async (req, res) => {
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

router.get('/export/db', async (_req, res) => {
  const [people, marriages, layouts] = await Promise.all([Person.findAll(), Marriage.findAll(), Layout.findAll()]);
  res.json({ people, marriages, layouts });
});

router.post('/import/db', requireAdmin, async (req, res) => {
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

module.exports = router;