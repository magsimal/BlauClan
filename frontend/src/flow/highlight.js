(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowHighlight = factory();
  }
})(this, function () {
  function createHighlightAPI({
    getNodes,
    getEdges,
    getSelectedEdge,
    getNodeById,
    childrenCache,
    addClass,
    removeClass,
    highlightedNodes,
    highlightedEdges,
  }) {
    function clearHighlights() {
      for (const nodeId of highlightedNodes) {
        const node = getNodeById(nodeId);
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

    function highlightBloodline(id) {
      clearHighlights();

      const map = {};
      const nodes = getNodes();
      nodes.forEach((n) => {
        map[n.id] = n;
      });

      const visitedUp = new Set();
      const visitedDown = new Set();

      function unionId(f, m) {
        return `u-${f}-${m}`;
      }

      function markNode(nId) {
        const node = map[String(nId)];
        if (node && node.data) {
          node.data.highlight = true;
          highlightedNodes.add(String(nId));
        }
      }

      function highlightAncestors(pid) {
        if (!pid || visitedUp.has(pid)) return;
        visitedUp.add(pid);
        const node = map[String(pid)];
        if (!node) return;
        markNode(pid);
        if (node.data.fatherId && node.data.motherId) {
          const uId = unionId(node.data.fatherId, node.data.motherId);
          markNode(uId);
        }
        highlightAncestors(node.data.fatherId);
        highlightAncestors(node.data.motherId);
      }

      function highlightDescendants(pid) {
        if (!pid || visitedDown.has(pid)) return;
        visitedDown.add(pid);
        const node = map[String(pid)];
        if (!node) return;
        markNode(pid);

        const kids = childrenCache.get(pid) || [];
        for (const childData of kids) {
          if (childData.fatherId && childData.motherId) {
            const uId = unionId(childData.fatherId, childData.motherId);
            markNode(uId);
          }
          highlightDescendants(parseInt(childData.id));
        }
      }

      highlightAncestors(id);
      highlightDescendants(id);

      const edges = getEdges();
      const sel = getSelectedEdge();
      edges.forEach((edge) => {
        const isSel = edge === sel;
        if (edge.id.startsWith('spouse-line')) {
          edge.class = isSel ? 'selected-edge' : 'faded-edge';
          if (!isSel) highlightedEdges.add(edge.id);
          return;
        }
        const src = map[edge.source];
        const tgt = map[edge.target];
        if (src?.data.highlight && tgt?.data.highlight) {
          edge.class = isSel ? 'selected-edge' : 'highlight-edge';
          if (!isSel) highlightedEdges.add(edge.id);
        } else {
          edge.class = isSel ? 'selected-edge' : 'faded-edge';
          if (!isSel) highlightedEdges.add(edge.id);
        }
      });
    }

    async function highlightBloodlineAsync(id) {
      clearHighlights();

      const map = new Map();
      const nodes = getNodes();
      nodes.forEach((n) => {
        map.set(n.id, n);
      });

      const visitedUp = new Set();
      const visitedDown = new Set();
      const toHighlight = new Set();
      const unionIds = new Set();

      function unionId(f, m) {
        return `u-${f}-${m}`;
      }

      function collectAncestors(pid) {
        if (!pid || visitedUp.has(pid)) return;
        visitedUp.add(pid);
        const node = map.get(String(pid));
        if (!node) return;
        toHighlight.add(pid);
        if (node.data.fatherId && node.data.motherId) {
          unionIds.add(unionId(node.data.fatherId, node.data.motherId));
        }
        collectAncestors(node.data.fatherId);
        collectAncestors(node.data.motherId);
      }

      function collectDescendants(pid) {
        if (!pid || visitedDown.has(pid)) return;
        visitedDown.add(pid);
        const node = map.get(String(pid));
        if (!node) return;
        toHighlight.add(pid);

        const kids = childrenCache.get(pid) || [];
        for (const childData of kids) {
          if (childData.fatherId && childData.motherId) {
            unionIds.add(unionId(childData.fatherId, childData.motherId));
          }
          collectDescendants(parseInt(childData.id));
        }
      }

      collectAncestors(id);
      collectDescendants(id);

      const nodesToUpdate = [...toHighlight, ...unionIds];
      const batchSize = 50;

      for (let i = 0; i < nodesToUpdate.length; i += batchSize) {
        const batch = nodesToUpdate.slice(i, i + batchSize);
        batch.forEach((nId) => {
          const node = map.get(String(nId));
          if (node && node.data) node.data.highlight = true;
        });
        if (i + batchSize < nodesToUpdate.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const edges = getEdges();
      const sel = getSelectedEdge();
      const edgeBatchSize = 100;
      for (let i = 0; i < edges.length; i += edgeBatchSize) {
        const batch = edges.slice(i, i + edgeBatchSize);
        batch.forEach((edge) => {
          const isSel = edge === sel;
          if (edge.id.startsWith('spouse-line')) {
            edge.class = isSel ? 'selected-edge' : 'faded-edge';
            if (!isSel) highlightedEdges.add(edge.id);
            return;
          }
          const src = map.get(edge.source);
          const tgt = map.get(edge.target);
          if (src?.data.highlight && tgt?.data.highlight) {
            edge.class = isSel ? 'selected-edge' : 'highlight-edge';
            if (!isSel) highlightedEdges.add(edge.id);
          } else {
            edge.class = isSel ? 'selected-edge' : 'faded-edge';
            if (!isSel) highlightedEdges.add(edge.id);
          }
        });
        if (i + edgeBatchSize < edges.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    return { clearHighlights, highlightBloodline, highlightBloodlineAsync };
  }

  return { createHighlightAPI };
});