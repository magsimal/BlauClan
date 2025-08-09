const express = require('express');
const { Op } = require('sequelize');
const { Person, Marriage } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { addPoints } = require('../services/points');
const { validatePlace } = require('../services/geonames');

function normalizeParentIds(data) {
  const updates = { ...data };
  ['fatherId', 'motherId', 'birthApprox', 'deathApprox', 'geonameId'].forEach((field) => {
    if (updates[field] === '') updates[field] = null;
  });
  return updates;
}

const router = express.Router();

router.get('/', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const payload = normalizeParentIds(req.body);
    if (!(await validatePlace(payload.placeOfBirth))) {
      return res.status(400).json({ error: 'Invalid placeOfBirth' });
    }
    const person = await Person.create(payload);
    await addPoints(req.session.user || 'guest', 5, `Created person ${person.id}`);
    res.status(201).json(person);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  res.json(person);
});

router.put('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  const updates = normalizeParentIds(req.body);
  if (!(await validatePlace(updates.placeOfBirth))) {
    return res.status(400).json({ error: 'Invalid placeOfBirth' });
  }
  const before = person.toJSON();
  await person.update(updates);
  let delta = 0;
  const changed = [];
  for (const [k, val] of Object.entries(updates)) {
    if (val === before[k]) continue;
    if ((before[k] === null || before[k] === '' || typeof before[k] === 'undefined') && val) {
      delta += 2;
    } else {
      delta += 1;
    }
    changed.push(k);
  }
  if (delta) await addPoints(req.session.user || 'guest', delta, `Updated person ${id}: ${changed.join(', ')}`);
  res.json(person);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const person = await Person.findByPk(id);
  if (!person) return res.sendStatus(404);
  await person.destroy();
  res.sendStatus(204);
});

// Spouses
router.get('/:id/spouses', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const marriages = await Marriage.findAll({ where: { [Op.or]: [{ personId: id }, { spouseId: id }] } });
  const result = [];
  for (const m of marriages) {
    const spouseId = m.personId == id ? m.spouseId : m.personId;
    const spouse = await Person.findByPk(spouseId);
    if (spouse) {
      result.push({
        marriageId: m.id,
        dateOfMarriage: m.dateOfMarriage,
        marriageApprox: m.marriageApprox,
        placeOfMarriage: m.placeOfMarriage,
        spouse,
      });
    }
  }
  res.json(result);
});

router.post('/:id/spouses', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const spouseId = parseInt(req.body.spouseId, 10);
    if (Number.isNaN(spouseId)) return res.status(400).json({ error: 'Invalid spouseId' });
    if (id === spouseId) return res.status(400).json({ error: 'Cannot marry self' });

    const [person, spouse] = await Promise.all([Person.findByPk(id), Person.findByPk(spouseId)]);
    if (!person || !spouse) return res.status(404).json({ error: 'Person not found' });

    const existing = await Marriage.findOne({ where: { [Op.or]: [ { personId: id, spouseId }, { personId: spouseId, spouseId: id } ] } });
    if (existing) return res.status(400).json({ error: 'Marriage already exists' });

    const marriage = await Marriage.create({
      personId: id,
      spouseId,
      dateOfMarriage: req.body.dateOfMarriage,
      marriageApprox: req.body.marriageApprox,
      placeOfMarriage: req.body.placeOfMarriage,
    });
    res.status(201).json(marriage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/spouses/:marriageId', requireAuth, async (req, res) => {
  const marriageId = parseInt(req.params.marriageId, 10);
  if (Number.isNaN(marriageId)) return res.status(400).json({ error: 'Invalid marriageId' });
  const marriage = await Marriage.findByPk(marriageId);
  if (!marriage) return res.sendStatus(404);
  await marriage.destroy();
  res.sendStatus(204);
});

module.exports = router;