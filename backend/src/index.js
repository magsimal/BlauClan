const { app, init } = require('./app');

const PORT = process.env.PORT || 3009;

if (require.main === module) {
  init().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

module.exports = app;
