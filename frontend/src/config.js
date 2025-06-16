(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.AppConfig = factory();
  }
})(this, function () {
  return {
    // grid size for snapping nodes. horizontalGridSize is slightly
    // smaller than verticalGridSize to allow tighter horizontal spacing
    horizontalGridSize: 20,
    verticalGridSize: 30,
    // how strongly relatives attract each other horizontally
    // 0 = very loose layout, 1 = compact layout
    relativeAttraction: parseFloat('${RELATIVE_ATTRACTION}') || 0.5,
  };
});
