const express = require('express');
const sequelize = require('./models');
const Person = require('./models/person');

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
  const person = await Person.findByPk(req.params.id);
  if (!person) return res.sendStatus(404);
  res.json(person);
});

app.put('/api/people/:id', async (req, res) => {
  const person = await Person.findByPk(req.params.id);
  if (!person) return res.sendStatus(404);
  await person.update(req.body);
  res.json(person);
});

app.delete('/api/people/:id', async (req, res) => {
  const person = await Person.findByPk(req.params.id);
  if (!person) return res.sendStatus(404);
  await person.destroy();
  res.sendStatus(204);
});

app.get('/api/export/json', async (_req, res) => {
  const people = await Person.findAll();
  res.json(people);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  sequelize.sync().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

module.exports = app;
