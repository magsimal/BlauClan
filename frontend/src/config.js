(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.AppConfig = factory();
  }
})(this, function () {
  return {
    gridSize: 30
  };
});
