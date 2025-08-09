(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowLayout = factory();
  }
})(this, function () {
  function createLayoutAPI({ d3, GenerationLayout, horizontalGridSize, relativeAttraction }) {
    function tidyUp(list) {
      if (list.length === 0) {
        return;
      }

      const map = new Map(
        list.map((n) => [n.id, { ...n, children: [], width: n.width || 0 }])
      );
      map.forEach((n) => {
        if (n.fatherId && map.has(n.fatherId)) {
          map.get(n.fatherId).children.push(n);
        } else if (n.motherId && map.has(n.motherId)) {
          map.get(n.motherId).children.push(n);
        }
      });

      const gen = GenerationLayout.assignGenerations(list);
      const ROW_HEIGHT = 230;

      const roots = [];
      map.forEach((n) => {
        const hasParent = list.some((p) => p.id === n.motherId || p.id === n.fatherId);
        if (!hasParent) roots.push(n);
      });
      const fakeRoot = { id: 'root', children: roots };
      const baseSpacing = horizontalGridSize * 4;
      const H_SPACING = baseSpacing - (baseSpacing - horizontalGridSize) * relativeAttraction;
      const layout = d3.tree().nodeSize([H_SPACING, 1]);
      const rootNode = d3.hierarchy(fakeRoot);
      layout(rootNode);

      if (rootNode.children) {
        rootNode.children.forEach(walk);
      }
      function walk(h) {
        const d = map.get(h.data.id);
        if (d) {
          d.x = h.x;
        }
        h.children && h.children.forEach(walk);
      }

      const couples = new Set();
      list.forEach((child) => {
        if (child.fatherId && child.motherId) {
          const key = `${child.fatherId}-${child.motherId}`;
          if (!couples.has(key)) {
            couples.add(key);
            const father = map.get(child.fatherId);
            const mother = map.get(child.motherId);
            if (father && mother) {
              const mid =
                (father.x + father.width / 2 + mother.x + mother.width / 2) /
                2;
              father.x = mid - father.width / 2 - H_SPACING / 2;
              mother.x = mid + H_SPACING / 2 - mother.width / 2;
            }
          }
        }
      });

      const links = [];
      list.forEach((p) => {
        if (p.fatherId && map.has(p.fatherId)) {
          links.push({ source: map.get(p.id), target: map.get(p.fatherId), type: 'parent' });
        }
        if (p.motherId && map.has(p.motherId)) {
          links.push({ source: map.get(p.id), target: map.get(p.motherId), type: 'parent' });
        }
        (p.spouseIds || []).forEach((sid) => {
          if (map.has(sid)) {
            links.push({ source: map.get(p.id), target: map.get(sid), type: 'spouse' });
          }
        });
      });

      const nodesForSim = Array.from(map.values());
      nodesForSim.forEach((n) => {
        const g = gen.get(n.id) ?? 0;
        n.y = g * ROW_HEIGHT;
        n.fy = n.y;
      });

      const linkForce = d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => (d.type === 'spouse' ? H_SPACING / 2 : 0))
        .strength(1);
      const collideForce = d3
        .forceCollide()
        .radius((d) => (d.width || 0) / 2 + H_SPACING / 2)
        .strength(1);
      const sim = d3
        .forceSimulation(nodesForSim)
        .force('link', linkForce)
        .force('collide', collideForce)
        .alphaDecay(0.05)
        .velocityDecay(0.4)
        .stop();
      for (let i = 0; i < 120; i++) sim.tick();
      nodesForSim.forEach((n) => {
        delete n.fy;
      });

      const rows = new Map();
      list.forEach((n) => {
        const g = gen.get(n.id) ?? 0;
        if (!rows.has(g)) rows.set(g, []);
        rows.get(g).push(map.get(n.id));
      });

      rows.forEach((row) => {
        row.forEach((p) => {
          if (typeof p.x !== 'number') p.x = 0;
        });
        row.sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) {
          const prev = row[i - 1];
          const curr = row[i];
          const prevRight = prev.x + (prev.width || 0);
          const minX = prevRight + H_SPACING;
          if (curr.x < minX) {
            curr.x = minX;
          }
        }

        const idMap = new Map(row.map((n) => [n.id, n]));
        const parentUF = {};
        const find = (id) => {
          if (!(id in parentUF)) parentUF[id] = id;
          if (parentUF[id] !== id) parentUF[id] = find(parentUF[id]);
          return parentUF[id];
        };
        const unite = (a, b) => {
          const pa = find(a);
          const pb = find(b);
          if (pa !== pb) parentUF[pb] = pa;
        };
        row.forEach((n) => {
          (n.spouseIds || []).forEach((sid) => {
            if (idMap.has(sid)) unite(n.id, sid);
          });
        });
        const groupsMap = {};
        row.forEach((n) => {
          const root = find(n.id);
          groupsMap[root] = groupsMap[root] || [];
          groupsMap[root].push(n);
        });
        const groups = Object.values(groupsMap);
        groups.forEach((g) => {
          g.sort((a, b) => a.x - b.x);
          for (let i = 1; i < g.length; i++) {
            const prev = g[i - 1];
            const curr = g[i];
            const minX = prev.x + (prev.width || 0) + H_SPACING;
            if (curr.x < minX) {
              const shift = minX - curr.x;
              for (let j = i; j < g.length; j++) {
                g[j].x += shift;
              }
            }
          }
        });
        groups.sort((a, b) => a[0].x - b[0].x);
        for (let i = 1; i < groups.length; i++) {
          const prevG = groups[i - 1];
          const currG = groups[i];
          const prevRight =
            prevG[prevG.length - 1].x +
            (prevG[prevG.length - 1].width || 0);
          const minX = prevRight + H_SPACING;
          if (currG[0].x < minX) {
            const shift = minX - currG[0].x;
            currG.forEach((n) => {
              n.x += shift;
            });
          }
        }
      });

      list.forEach((n) => {
        const p = map.get(n.id);
        n.x = p.x;
        const g = gen.get(n.id) ?? 0;
        n.y = g * ROW_HEIGHT;
      });
    }

    async function tidyUpChunked(list) {
      if (list.length === 0) {
        return;
      }

      const CHUNK_SIZE = Math.min(500, Math.max(50, Math.floor(list.length / 10)));

      const map = new Map(
        list.map((n) => [n.id, { ...n, children: [], width: n.width || 0 }])
      );

      let processed = 0;
      for (const [, node] of map) {
        if (node.fatherId && map.has(node.fatherId)) {
          map.get(node.fatherId).children.push(node);
        } else if (node.motherId && map.has(node.motherId)) {
          map.get(node.motherId).children.push(node);
        }
        processed++;
        if (processed % CHUNK_SIZE === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const gen = GenerationLayout.assignGenerations(list);
      const ROW_HEIGHT = 230;

      const roots = [];
      map.forEach((n) => {
        const hasParent = list.some((p) => p.id === n.motherId || p.id === n.fatherId);
        if (!hasParent) roots.push(n);
      });

      const fakeRoot = { id: 'root', children: roots };
      const baseSpacing = horizontalGridSize * 4;
      const H_SPACING = baseSpacing - (baseSpacing - horizontalGridSize) * relativeAttraction;
      const layout = d3.tree().nodeSize([H_SPACING, 1]);
      const rootNode = d3.hierarchy(fakeRoot);
      layout(rootNode);

      if (rootNode.children) {
        rootNode.children.forEach(walk);
      }
      function walk(h) {
        const d = map.get(h.data.id);
        if (d) {
          d.x = h.x;
        }
        h.children && h.children.forEach(walk);
      }

      const couples = new Set();
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        const chunk = list.slice(i, i + CHUNK_SIZE);
        chunk.forEach((child) => {
          if (child.fatherId && child.motherId) {
            const key = `${child.fatherId}-${child.motherId}`;
            if (!couples.has(key)) {
              couples.add(key);
              const father = map.get(child.fatherId);
              const mother = map.get(child.motherId);
              if (father && mother) {
                const mid =
                  (father.x + father.width / 2 + mother.x + mother.width / 2) /
                  2;
                father.x = mid - father.width / 2 - H_SPACING / 2;
                mother.x = mid + H_SPACING / 2 - mother.width / 2;
              }
            }
          }
        });
        if (i + CHUNK_SIZE < list.length) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const links = [];
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        const chunk = list.slice(i, i + CHUNK_SIZE);
        chunk.forEach((p) => {
          if (p.fatherId && map.has(p.fatherId)) {
            links.push({ source: map.get(p.id), target: map.get(p.fatherId), type: 'parent' });
          }
          if (p.motherId && map.has(p.motherId)) {
            links.push({ source: map.get(p.id), target: map.get(p.motherId), type: 'parent' });
          }
          (p.spouseIds || []).forEach((sid) => {
            if (map.has(sid)) {
              links.push({ source: map.get(p.id), target: map.get(sid), type: 'spouse' });
            }
          });
        });
        if (i + CHUNK_SIZE < list.length) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const nodesForSim = Array.from(map.values());
      nodesForSim.forEach((n) => {
        const g = gen.get(n.id) ?? 0;
        n.y = g * ROW_HEIGHT;
        n.fy = n.y;
      });

      const linkForce = d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => (d.type === 'spouse' ? H_SPACING / 2 : 0))
        .strength(1);
      const collideForce = d3
        .forceCollide()
        .radius((d) => (d.width || 0) / 2 + H_SPACING / 2)
        .strength(1);
      const sim = d3
        .forceSimulation(nodesForSim)
        .force('link', linkForce)
        .force('collide', collideForce)
        .alphaDecay(0.05)
        .velocityDecay(0.4)
        .stop();

      const SIMULATION_CHUNK = 10;
      for (let i = 0; i < 120; i += SIMULATION_CHUNK) {
        const iterations = Math.min(SIMULATION_CHUNK, 120 - i);
        for (let j = 0; j < iterations; j++) {
          sim.tick();
        }
        if (i + SIMULATION_CHUNK < 120) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      nodesForSim.forEach((n) => {
        delete n.fy;
      });

      const rows = new Map();
      nodesForSim.forEach((n) => {
        const row = Math.round(n.y / ROW_HEIGHT);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(n);
      });

      rows.forEach((rowNodes) => {
        rowNodes.sort((a, b) => a.x - b.x);
        let lastX = Number.NEGATIVE_INFINITY;
        rowNodes.forEach((n) => {
          if (n.x < lastX + (n.width || 0) / 2 + H_SPACING / 2) {
            n.x = lastX + (n.width || 0) / 2 + H_SPACING / 2;
          }
          lastX = n.x + (n.width || 0) / 2;
        });
      });

      list.forEach((original) => {
        const updated = map.get(original.id);
        if (updated) {
          original.x = updated.x;
          original.y = updated.y;
        }
      });
    }

    return { tidyUp, tidyUpChunked };
  }

  return { createLayoutAPI };
});