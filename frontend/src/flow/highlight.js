(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowHighlight = factory();
  }
})(this, function () {
  const Metrics =
    typeof require === 'function'
      ? (() => {
        try { return require('../utils/perf-metrics'); } catch (e) { return null; }
      })()
      : (typeof window !== 'undefined'
        ? (window.FlowMetrics || window.PerfMetrics || null)
        : null);

  function createHighlightAPI({
    getNodes: _getNodes,
    getEdges,
    getSelectedEdge,
    getNodeById,
    childrenCache,
    addClass: _addClass,
    removeClass,
    highlightedNodes,
    highlightedEdges,
    isNodeVisible,
    shouldLimitHighlight,
  }) {
    const metrics = Metrics && typeof Metrics.recordEvent === 'function' ? Metrics : null;
    let activeRootId = null;

    function resetHighlights() {
      for (const nodeId of highlightedNodes) {
        const node = getNodeById(String(nodeId));
        if (node && node.data) node.data.highlight = false;
      }
      highlightedNodes.clear();

      const edges = getEdges();
      for (const edgeId of highlightedEdges) {
        const edge = edges.find((e) => e.id === edgeId);
        if (edge) {
          removeClass(edge, 'highlight-edge');
          removeClass(edge, 'faded-edge');
          if (!edge.class || edge.class.trim() === '') {
            delete edge.class;
          }
        }
      }
      highlightedEdges.clear();
    }

    function clearHighlights() {
      resetHighlights();
      activeRootId = null;
    }

    function unionId(f, m) {
      return `u-${f}-${m}`;
    }

    function gatherTargets(id) {
      const visitedUp = new Set();
      const visitedDown = new Set();
      const nodeIds = new Set();
      const unionIds = new Set();

      function addNodeId(nId) {
        if (nId === null || typeof nId === 'undefined') return;
        nodeIds.add(String(nId));
      }

      function walkAncestors(pid) {
        if (!pid) return;
        const strPid = String(pid);
        if (visitedUp.has(strPid)) return;
        visitedUp.add(strPid);
        const node = getNodeById(strPid);
        if (!node || !node.data) return;
        addNodeId(pid);
        if (node.data.fatherId && node.data.motherId) {
          unionIds.add(unionId(node.data.fatherId, node.data.motherId));
        }
        walkAncestors(node.data.fatherId);
        walkAncestors(node.data.motherId);
      }

      function walkDescendants(pid) {
        if (!pid) return;
        const strPid = String(pid);
        if (visitedDown.has(strPid)) return;
        visitedDown.add(strPid);
        const node = getNodeById(strPid);
        if (!node || !node.data) return;
        addNodeId(pid);

        const numericKey = typeof pid === 'number' ? pid : parseInt(strPid, 10);
        const cacheKey = Number.isNaN(numericKey) ? strPid : numericKey;
        const kids = childrenCache.get(cacheKey) || childrenCache.get(strPid) || [];
        for (const childData of kids) {
          if (childData.fatherId && childData.motherId) {
            unionIds.add(unionId(childData.fatherId, childData.motherId));
          }
          const childId = parseInt(childData.id, 10);
          walkDescendants(Number.isNaN(childId) ? childData.id : childId);
        }
      }

      walkAncestors(id);
      walkDescendants(id);

      return { nodeIds, unionIds };
    }

    function shouldIncludeNode(node, limitToVisible, isRoot) {
      if (!node) return false;
      if (limitToVisible && !isRoot && typeof isNodeVisible === 'function') {
        return !!isNodeVisible(node);
      }
      return true;
    }

    function applyNodeHighlights(ids, limitToVisible, rootKey) {
      const limit = !!limitToVisible;
      ids.forEach((nodeId) => {
        const strId = String(nodeId);
        const node = getNodeById(strId);
        if (!shouldIncludeNode(node, limit, strId === String(rootKey))) return;
        if (node.data) node.data.highlight = true;
        highlightedNodes.add(strId);
      });
    }

    async function applyNodeHighlightsAsync(ids, limitToVisible, rootKey) {
      const limit = !!limitToVisible;
      const batchSize = 50;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        batch.forEach((nodeId) => {
          const strId = String(nodeId);
          const node = getNodeById(strId);
          if (!shouldIncludeNode(node, limit, strId === String(rootKey))) return;
          if (node.data) node.data.highlight = true;
          highlightedNodes.add(strId);
        });
        if (i + batchSize < ids.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    function updateEdges(limitToVisible) {
      const edges = getEdges();
      const sel = getSelectedEdge();
      const limit = !!limitToVisible;
      edges.forEach((edge) => {
        const isSel = edge === sel;
        const srcHighlighted = highlightedNodes.has(String(edge.source));
        const tgtHighlighted = highlightedNodes.has(String(edge.target));
        if (limit && !srcHighlighted && !tgtHighlighted && !edge.id.startsWith('spouse-line')) {
          return;
        }
        if (edge.id.startsWith('spouse-line')) {
          const both = srcHighlighted && tgtHighlighted;
          edge.class = isSel ? 'selected-edge' : both ? 'highlight-edge' : 'faded-edge';
          if (!isSel) highlightedEdges.add(edge.id);
          return;
        }
        if (srcHighlighted && tgtHighlighted) {
          edge.class = isSel ? 'selected-edge' : 'highlight-edge';
        } else {
          edge.class = isSel ? 'selected-edge' : 'faded-edge';
        }
        if (!isSel) highlightedEdges.add(edge.id);
      });
    }

    async function updateEdgesAsync(limitToVisible) {
      const edges = getEdges();
      const sel = getSelectedEdge();
      const limit = !!limitToVisible;
      const edgeBatchSize = 100;
      for (let i = 0; i < edges.length; i += edgeBatchSize) {
        const batch = edges.slice(i, i + edgeBatchSize);
        batch.forEach((edge) => {
          const isSel = edge === sel;
          const srcHighlighted = highlightedNodes.has(String(edge.source));
          const tgtHighlighted = highlightedNodes.has(String(edge.target));
          if (limit && !srcHighlighted && !tgtHighlighted && !edge.id.startsWith('spouse-line')) {
            return;
          }
          if (edge.id.startsWith('spouse-line')) {
            const both = srcHighlighted && tgtHighlighted;
            edge.class = isSel ? 'selected-edge' : both ? 'highlight-edge' : 'faded-edge';
            if (!isSel) highlightedEdges.add(edge.id);
            return;
          }
          if (srcHighlighted && tgtHighlighted) {
            edge.class = isSel ? 'selected-edge' : 'highlight-edge';
          } else {
            edge.class = isSel ? 'selected-edge' : 'faded-edge';
          }
          if (!isSel) highlightedEdges.add(edge.id);
        });
        if (i + edgeBatchSize < edges.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    function resolveLimitPreference(options) {
      if (options && Object.prototype.hasOwnProperty.call(options, 'limitToVisible')) {
        return !!options.limitToVisible;
      }
      if (typeof shouldLimitHighlight === 'function') {
        try { return !!shouldLimitHighlight(); } catch (e) { return false; }
      }
      return false;
    }

    function highlightBloodline(id, options = {}) {
      const rootKey = String(id);
      if (activeRootId === rootKey && highlightedNodes.size) {
        if (metrics && typeof metrics.incrementCounter === 'function') {
          metrics.incrementCounter('highlight.cacheHits', 1);
        }
        return;
      }
      const limitToVisible = resolveLimitPreference(options);
      if (metrics && limitToVisible && typeof metrics.incrementCounter === 'function') {
        metrics.incrementCounter('highlight.limitApplied', 1);
      }
      const timer = metrics && typeof metrics.startTimer === 'function'
        ? metrics.startTimer('highlight.sync', { rootId: rootKey, limitToVisible })
        : null;
      resetHighlights();
      const targets = gatherTargets(rootKey);
      const combinedIds = [...targets.nodeIds, ...targets.unionIds];
      applyNodeHighlights(combinedIds, limitToVisible, rootKey);
      updateEdges(limitToVisible);
      if (metrics) {
        if (typeof metrics.recordSample === 'function') {
          metrics.recordSample('highlight.targets.nodes', targets.nodeIds.size);
          metrics.recordSample('highlight.targets.unions', targets.unionIds.size);
          metrics.recordSample('highlight.nodesApplied', highlightedNodes.size);
          metrics.recordSample('highlight.edgesApplied', highlightedEdges.size);
        }
        if (typeof metrics.endTimer === 'function') {
          metrics.endTimer(timer, {
            rootId: rootKey,
            limitToVisible,
            nodeTargets: targets.nodeIds.size,
            unionTargets: targets.unionIds.size,
            highlightedNodes: highlightedNodes.size,
            highlightedEdges: highlightedEdges.size,
          });
        }
      }
      activeRootId = rootKey;
    }

    async function highlightBloodlineAsync(id, options = {}) {
      const rootKey = String(id);
      if (activeRootId === rootKey && highlightedNodes.size) {
        if (metrics && typeof metrics.incrementCounter === 'function') {
          metrics.incrementCounter('highlight.cacheHits', 1);
        }
        return;
      }
      const limitToVisible = resolveLimitPreference(options);
      if (metrics && limitToVisible && typeof metrics.incrementCounter === 'function') {
        metrics.incrementCounter('highlight.limitApplied', 1);
      }
      const timer = metrics && typeof metrics.startTimer === 'function'
        ? metrics.startTimer('highlight.async', { rootId: rootKey, limitToVisible })
        : null;
      resetHighlights();
      const targets = gatherTargets(rootKey);
      const combinedIds = [...targets.nodeIds, ...targets.unionIds];
      await applyNodeHighlightsAsync(combinedIds, limitToVisible, rootKey);
      await updateEdgesAsync(limitToVisible);
      if (metrics) {
        if (typeof metrics.recordSample === 'function') {
          metrics.recordSample('highlight.targets.nodes', targets.nodeIds.size);
          metrics.recordSample('highlight.targets.unions', targets.unionIds.size);
          metrics.recordSample('highlight.nodesApplied', highlightedNodes.size);
          metrics.recordSample('highlight.edgesApplied', highlightedEdges.size);
        }
        if (typeof metrics.endTimer === 'function') {
          metrics.endTimer(timer, {
            rootId: rootKey,
            limitToVisible,
            nodeTargets: targets.nodeIds.size,
            unionTargets: targets.unionIds.size,
            highlightedNodes: highlightedNodes.size,
            highlightedEdges: highlightedEdges.size,
          });
        }
      }
      activeRootId = rootKey;
    }

    return { clearHighlights, highlightBloodline, highlightBloodlineAsync };
  }

  return { createHighlightAPI };
});