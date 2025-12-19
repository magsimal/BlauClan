const express = require('express');
const { Layout } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const layout = await Layout.create({ data: req.body });
    res.status(201).json(layout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (_req, res) => {
  const layout = await Layout.findOne({ order: [['createdAt', 'DESC']] });
  if (!layout) return res.json(null);
  res.json(layout.data);
});

module.exports = router;