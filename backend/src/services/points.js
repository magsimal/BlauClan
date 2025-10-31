/**
 * Points and activity logging service.
 *
 * @module services/points
 */
const { Score, Activity } = require('../models');

async function addPoints(username, delta, description) {
  if (!username) return;
  const [row] = await Score.findOrCreate({ where: { username }, defaults: { points: 0 } });
  row.points += delta;
  await row.save();
  if (description) {
    await Activity.create({ username, description, points: delta });
  }
}

module.exports = { addPoints };