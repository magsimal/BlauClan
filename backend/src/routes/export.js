const express = require('express');
const { sequelize, Person, Marriage, Layout } = require('../models');
const { attachMetricsToPeople, buildMetricsMap } = require('../utils/treeMetrics');
const { requireAdmin } = require('../middleware/auth');

async function buildAncestors(id, options = {}, visited = new Set()) {
  const { maxDepth = 16, depth = 0 } = options;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) return null;
  if (depth > maxDepth) return null;
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
  if (depth > maxDepth) return null;
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

function applyMetrics(person, metrics) {
  if (!person || typeof person !== 'object') return;
  const entry = metrics.get(person.id);
  if (entry) {
    person.childCount = entry.childCount;
    person.ancestryDepth = entry.ancestryDepth;
  }
}

function annotateAncestors(node, metrics) {
  if (!node) return;
  applyMetrics(node, metrics);
  if (node.father) annotateAncestors(node.father, metrics);
  if (node.mother) annotateAncestors(node.mother, metrics);
}

function annotateDescendants(node, metrics) {
  if (!node) return;
  applyMetrics(node, metrics);
  if (!Array.isArray(node.spouseRelationships)) return;
  for (const rel of node.spouseRelationships) {
    if (rel && rel.spouse) applyMetrics(rel.spouse, metrics);
    if (rel && Array.isArray(rel.children)) {
      for (const child of rel.children) {
        annotateDescendants(child, metrics);
      }
    }
  }
}

function sanitizePersonNode(node) {
  if (!node) return null;
  const sanitized = { ...node };
  delete sanitized.father;
  delete sanitized.mother;
  delete sanitized.spouseRelationships;
  return sanitized;
}

function ensureMeta(map, id) {
  if (!map.has(id)) {
    map.set(id, {
      hasMoreAncestors: false,
      hasMoreDescendants: false,
    });
  }
  return map.get(id);
}

function flattenAncestors(node, options, peopleMap, metaMap, depth = 0) {
  if (!node || !node.id) return;
  const limit = options.maxDepth;
  if (depth > limit) return;
  const person = sanitizePersonNode(node);
  if (!peopleMap.has(person.id)) {
    peopleMap.set(person.id, person);
  }
  const meta = ensureMeta(metaMap, person.id);
  if (depth === limit) {
    if ((node.father && node.father.id) || (node.mother && node.mother.id)) {
      meta.hasMoreAncestors = true;
    }
    return;
  }
  flattenAncestors(node.father, options, peopleMap, metaMap, depth + 1);
  flattenAncestors(node.mother, options, peopleMap, metaMap, depth + 1);
}

function flattenDescendants(node, options, peopleMap, metaMap, depth = 0, visited = new Set()) {
  if (!node || !node.id) return false;
  if (depth > options.maxDepth) return false;
  if (visited.has(node.id)) return false;
  visited.add(node.id);

  const person = sanitizePersonNode(node);
  if (!peopleMap.has(person.id)) {
    peopleMap.set(person.id, person);
  }
  const meta = ensureMeta(metaMap, person.id);

  if (!Array.isArray(node.spouseRelationships)) return false;

  let hasHiddenDescendants = false;

  for (const rel of node.spouseRelationships) {
    if (!rel) continue;
    if (rel.spouse && rel.spouse.id) {
      const spouse = sanitizePersonNode(rel.spouse);
      if (!peopleMap.has(spouse.id)) {
        peopleMap.set(spouse.id, spouse);
      }
      ensureMeta(metaMap, spouse.id);
    }
    const children = Array.isArray(rel.children) ? rel.children : [];
    if (children.length && depth + 1 === options.maxDepth) {
      hasHiddenDescendants = true;
    }
    if (depth === options.maxDepth) {
      if (children.some((c) => c && c.id)) {
        hasHiddenDescendants = true;
      }
      continue;
    }
    for (const child of children) {
      const childHasHidden = flattenDescendants(child, options, peopleMap, metaMap, depth + 1, visited);
      if (childHasHidden) {
        hasHiddenDescendants = true;
      }
    }
  }

  if (hasHiddenDescendants) {
    meta.hasMoreDescendants = true;
  }

  return hasHiddenDescendants;
}

const router = express.Router();

router.get('/tree/:id/segment', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { type = 'both', maxDepth } = req.query;
  const limit = Math.max(1, Math.min(64, parseInt(maxDepth || '4', 10) || 4));
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);

  const peopleMap = new Map();
  const metaMap = new Map();

  if (type === 'ancestors' || type === 'both') {
    const ancestorsTree = await buildAncestors(person.id, { maxDepth: limit });
    flattenAncestors(ancestorsTree, { maxDepth: limit }, peopleMap, metaMap);
  }

  if (type === 'descendants' || type === 'both') {
    const descendantsTree = await buildDescendants(person.id, { maxDepth: limit });
    flattenDescendants(descendantsTree, { maxDepth: limit }, peopleMap, metaMap);
  }

  if (!peopleMap.has(person.id)) {
    peopleMap.set(person.id, person.toJSON());
  }
  ensureMeta(metaMap, person.id);

  const people = Array.from(peopleMap.values()).map((p) => ({
    person: p,
    hints: metaMap.get(p.id) || { hasMoreAncestors: false, hasMoreDescendants: false },
  }));

  res.json({ rootId: person.id, people, requestedDepth: limit, type });
});

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
  const metricsSource = await Person.findAll({ attributes: ['id', 'fatherId', 'motherId'] });
  const metrics = buildMetricsMap(metricsSource);
  if (result.ancestors) annotateAncestors(result.ancestors, metrics);
  if (result.descendants) annotateDescendants(result.descendants, metrics);
  res.json(result);
});

router.get('/export/json', async (req, res) => {
  const { filter } = req.query;
  if (filter) {
    const id = parseInt(filter, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid filter' });
    const tree = await buildDescendants(id);
    const metricsSource = await Person.findAll({ attributes: ['id', 'fatherId', 'motherId'] });
    const metrics = buildMetricsMap(metricsSource);
    annotateDescendants(tree, metrics);
    res.json(tree);
  } else {
    const people = await Person.findAll();
    const enriched = attachMetricsToPeople(people);
    res.json(enriched);
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