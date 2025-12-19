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
    maxSimulationTicks: parseInt('${MAX_SIMULATION_TICKS}', 10) || 72,
    lowPowerSimulationTicks: parseInt('${LOW_POWER_SIMULATION_TICKS}', 10) || 42,
    skipForceSimulationThreshold: parseInt('${SKIP_FORCE_SIMULATION_THRESHOLD}', 10) || 1400,
    lowPowerCpuThreshold: parseInt('${LOW_POWER_CPU_THRESHOLD}', 10) || 2,
    highlightLimitNodeCount: parseInt('${HIGHLIGHT_LIMIT_NODE_COUNT}', 10) || 800,
    showDeleteAllButton: '${SHOW_DELETE_ALL_BUTTON}' === 'true',
    loginEnabled: '${LOGIN_ENABLED}' === 'true',
  };
});
