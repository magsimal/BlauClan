const express = require('express');
const { sequelize, Person, Marriage, Layout } = require('../models');
const { requireAdmin } = require('../middleware/auth');

async function buildAncestors(id, options = {}, visited = new Set()) {
  const { maxDepth = 16, depth = 0 } = options;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  if (depth >= maxDepth) return null;
  if (visited.has(numericId)) return null;
  visited.add(numericId);
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  node.father = null;
  node.mother = null;
  if (person.fatherId) node.father = await buildAncestors(person.fatherId, { maxDepth, depth: depth + 1 }, visited);
  if (person.motherId) node.mother = await buildAncestors(person.motherId, { maxDepth, depth: depth + 1 }, visited);
  return node;
}

async function buildDescendants(id, options = {}, visited = new Set()) {
  const { maxDepth = 16, depth = 0 } = options;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  if (depth >= maxDepth) return null;
  if (visited.has(numericId)) return null;
  visited.add(numericId);
  const person = await Person.findByPk(numericId);
  if (!person) return null;
  const node = person.toJSON();
  const Op = require('sequelize').Op;
  const marriages = await Marriage.findAll({ where: { [Op.or]: [{ personId: numericId }, { spouseId: numericId }] } });
  node.spouseRelationships = [];
  for (const m of marriages) {
    const spouseId = m.personId === numericId ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (!spouse) continue;
    const children = await Person.findAll({ where: { [Op.or]: [ { fatherId: numericId, motherId: spouseId }, { fatherId: spouseId, motherId: numericId } ] } });
    const childNodes = [];
    for (const child of children) {
      const sub = await buildDescendants(child.id, { maxDepth, depth: depth + 1 }, visited);
      if (sub) childNodes.push(sub);
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
  const { type = 'both', maxDepth } = req.query;
  const limit = Math.max(1, Math.min(64, parseInt(maxDepth || '16', 10) || 16));
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const result = { id: person.id };
  if (type === 'ancestors' || type === 'both') result.ancestors = await buildAncestors(person.id, { maxDepth: limit });
  if (type === 'descendants' || type === 'both') result.descendants = await buildDescendants(person.id, { maxDepth: limit });
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