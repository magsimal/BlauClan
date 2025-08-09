const express = require('express');
const { geonamesSuggest } = require('../services/geonames');

const router = express.Router();

router.get('/suggest', async (req, res) => {
  const { q = '', lang = 'en', cc = '' } = req.query;
  const suggestions = await geonamesSuggest(q, lang, cc);
  res.json(suggestions);
});

module.exports = router;