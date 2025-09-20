(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowLayout = factory();
  }
})(this, function () {
  function createLayoutAPI({
    d3,
    GenerationLayout,
    horizontalGridSize,
    relativeAttraction,
    performanceProfile,
  }) {
    const profile = performanceProfile || {};
    const isLowPower = !!profile.isLowPower;
    const maxTicks = Number.isFinite(profile.maxSimulationTicks)
      ? profile.maxSimulationTicks
      : 72;
    const lowPowerTicks = Number.isFinite(profile.lowPowerTicks)
      ? profile.lowPowerTicks
      : Number.isFinite(profile.lowPowerSimulationTicks)
        ? profile.lowPowerSimulationTicks
        : Math.max(24, Math.round(maxTicks * 0.6));
    const skipForceThreshold = Number.isFinite(profile.skipForceSimulationThreshold)
      ? profile.skipForceSimulationThreshold
      : Number.isFinite(profile.skipForceThreshold)
        ? profile.skipForceThreshold
        : Infinity;
    const tickChunkSize = Number.isFinite(profile.tickChunkSize)
      ? Math.max(1, Math.floor(profile.tickChunkSize))
      : 10;
    const collisionStrength = Number.isFinite(profile.collisionStrength)
      ? profile.collisionStrength
      : isLowPower
        ? 0.75
        : 1;
    const linkStrength = Number.isFinite(profile.linkStrength)
      ? profile.linkStrength
      : isLowPower
        ? 0.75
        : 1;

    async function yieldToMainThread(meta) {
      if (typeof profile.yieldControl === 'function') {
        await profile.yieldControl(meta);
        return;
      }
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        await new Promise((resolve) =>
          window.requestIdleCallback(() => resolve(), { timeout: 16 })
        );
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, isLowPower ? 24 : 12)
      );
    }

    function shouldSkipForces(count) {
      return Number.isFinite(skipForceThreshold) && count >= skipForceThreshold;
    }

    function simulationTicks(count) {
      if (shouldSkipForces(count)) return 0;
      if (typeof profile.getSimulationTicks === 'function') {
        const custom = profile.getSimulationTicks(count, { isLowPower });
        if (Number.isFinite(custom) && custom >= 0) {
          return custom;
        }
      }
      return isLowPower ? lowPowerTicks : maxTicks;
    }

    function tidyUp(list) {
      if (list.length === 0) {
        return;
      }

      const GRID = Number.isFinite(horizontalGridSize) && horizontalGridSize > 0 ? horizontalGridSize : 30;
      const ATTR = Math.max(0, Math.min(1, Number.isFinite(relativeAttraction) ? relativeAttraction : 0.5));
      const baseSpacing = GRID * 4;
      const H_SPACING_RAW = baseSpacing - (baseSpacing - GRID) * ATTR;
      const H_SPACING = Number.isFinite(H_SPACING_RAW) && H_SPACING_RAW > 0 ? H_SPACING_RAW : GRID * 3;
      const DEFAULT_WIDTH = Math.max(120, GRID * 4);

      const map = new Map(
        list.map((n) => [n.id, { ...n, children: [], width: n.width || DEFAULT_WIDTH }])
      );
      const parentLookup = new Set();
      list.forEach((n) => {
        if (n.fatherId) parentLookup.add(n.fatherId);
        if (n.motherId) parentLookup.add(n.motherId);
      });
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
        if (!parentLookup.has(n.id)) roots.push(n);
      });
      const fakeRoot = { id: 'root', children: roots };
      const layout = d3.tree().nodeSize([H_SPACING, 1]);
      const rootNode = d3.hierarchy(fakeRoot);
      layout(rootNode);

      if (rootNode.children) {
        rootNode.children.forEach(walk);
      }
      function walk(h) {
        const d = map.get(h.data.id);
        if (d) {
          d.x = Number.isFinite(h.x) ? h.x : (Number.isFinite(d.x) ? d.x : 0);
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

      // Pre-compute target X for children groups per parents to enforce sibling ordering by birth
      const childTargets = new Map();
      const childrenByParents = new Map();
      list.forEach((c) => {
        const father = c.fatherId ? map.get(c.fatherId) : null;
        const mother = c.motherId ? map.get(c.motherId) : null;
        if (!father && !mother) return;
        const key = father && mother ? `${c.fatherId}-${c.motherId}` : father ? `f-${c.fatherId}` : `m-${c.motherId}`;
        if (!childrenByParents.has(key)) childrenByParents.set(key, { father, mother, children: [] });
        childrenByParents.get(key).children.push(map.get(c.id));
      });
      childrenByParents.forEach(({ father, mother, children }) => {
        if (!children || children.length === 0) return;
        const center = (() => {
          if (father && mother) {
            return (
              father.x + father.width / 2 + (mother.x + mother.width / 2)
            ) / 2;
          }
          const p = father || mother;
          return p.x + p.width / 2;
        })();
        children.sort((a, b) => {
          const ak = Number.isFinite(a.birthSortKey) ? a.birthSortKey : 99999;
          const bk = Number.isFinite(b.birthSortKey) ? b.birthSortKey : 99999;
          return ak - bk;
        });
        const totalWidth = children.reduce((sum, n, i) => sum + (n.width || DEFAULT_WIDTH) + (i > 0 ? H_SPACING : 0), 0);
        let x = center - totalWidth / 2;
        children.forEach((n, idx) => {
          const w = n.width || DEFAULT_WIDTH;
          // place child at left edge x; we align nodes by their left side consistently with other code
          childTargets.set(n.id, x);
          x += w + H_SPACING;
        });
        // also compute a helper target for the union midpoint if both parents present
        if (father && mother) {
          const unionKey = `u-${father.id}-${mother.id}`;
          childTargets.set(unionKey, center);
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
        // Precompute birth sort key if available (year first, then month/day fallback)
        if (n.dateOfBirth || n.birthApprox) {
          const str = String(n.dateOfBirth || n.birthApprox);
          // Extract year-month-day when present; fallback to year only
          const m = str.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/);
          if (m) {
            const year = parseInt(m[1], 10);
            const month = m[2] ? parseInt(m[2], 10) : 6; // mid-year default
            const day = m[3] ? parseInt(m[3], 10) : 15; // mid-month default
            n.birthSortKey = year * 372 + (month - 1) * 31 + day; // monotonic mapping
          }
        }
      });

      const totalTicks = simulationTicks(nodesForSim.length);
      if (totalTicks > 0) {
        const linkForce = d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => (d.type === 'spouse' ? H_SPACING / 2 : H_SPACING))
          .strength(linkStrength);
        const collideForce = d3
          .forceCollide()
          .radius((d) => (d.width || DEFAULT_WIDTH) / 2 + H_SPACING / 2)
          .strength(collisionStrength);
        const sim = d3
          .forceSimulation(nodesForSim)
          .force('link', linkForce)
          .force('collide', collideForce)
          .alphaDecay(0.06)
          .velocityDecay(0.45)
          .stop();
        for (let i = 0; i < totalTicks; i++) sim.tick();
      }
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
          if (childTargets.has(p.id)) {
            p.x = childTargets.get(p.id);
          } else if (typeof p.x !== 'number') {
            p.x = 0;
          }
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

      const chunkDivisor = isLowPower ? 14 : 10;
      const baseChunk = Math.floor(list.length / chunkDivisor);
      const CHUNK_SIZE = Math.min(
        isLowPower ? 250 : 500,
        Math.max(isLowPower ? 25 : 50, baseChunk || (isLowPower ? 40 : 60))
      );

      const GRID = Number.isFinite(horizontalGridSize) && horizontalGridSize > 0 ? horizontalGridSize : 30;
      const ATTR = Math.max(0, Math.min(1, Number.isFinite(relativeAttraction) ? relativeAttraction : 0.5));
      const baseSpacing = GRID * 4;
      const H_SPACING_RAW = baseSpacing - (baseSpacing - GRID) * ATTR;
      const H_SPACING = Number.isFinite(H_SPACING_RAW) && H_SPACING_RAW > 0 ? H_SPACING_RAW : GRID * 3;
      const DEFAULT_WIDTH = Math.max(120, GRID * 4);

      const map = new Map(
        list.map((n) => [n.id, { ...n, children: [], width: n.width || DEFAULT_WIDTH }])
      );

      const parentLookup = new Set();
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        const chunk = list.slice(i, i + CHUNK_SIZE);
        chunk.forEach((original) => {
          if (original.fatherId) parentLookup.add(original.fatherId);
          if (original.motherId) parentLookup.add(original.motherId);
          const node = map.get(original.id);
          if (!node) return;
          if (node.fatherId && map.has(node.fatherId)) {
            map.get(node.fatherId).children.push(node);
          } else if (node.motherId && map.has(node.motherId)) {
            map.get(node.motherId).children.push(node);
          }
        });
        if (i + CHUNK_SIZE < list.length) {
          await yieldToMainThread({ phase: 'build-children' });
        }
      }

      const gen = GenerationLayout.assignGenerations(list);
      const ROW_HEIGHT = 230;

      const roots = [];
      map.forEach((n) => {
        if (!parentLookup.has(n.id)) roots.push(n);
      });

      const fakeRoot = { id: 'root', children: roots };
      const layout = d3.tree().nodeSize([H_SPACING, 1]);
      const rootNode = d3.hierarchy(fakeRoot);
      layout(rootNode);

      if (rootNode.children) {
        rootNode.children.forEach(walk);
      }
      function walk(h) {
        const d = map.get(h.data.id);
        if (d) {
          d.x = Number.isFinite(h.x) ? h.x : (Number.isFinite(d.x) ? d.x : 0);
        }
        h.children && h.children.forEach(walk);
      }

      const couples = new Set();
      const childTargets = new Map();
      const childrenByParents = new Map();
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        const chunk = list.slice(i, i + CHUNK_SIZE);
        chunk.forEach((child) => {
          const childNode = map.get(child.id);
          if (!childNode) return;
          const father = child.fatherId ? map.get(child.fatherId) : null;
          const mother = child.motherId ? map.get(child.motherId) : null;
          if (father && mother) {
            const key = `${child.fatherId}-${child.motherId}`;
            if (!couples.has(key)) {
              couples.add(key);
              const mid =
                (father.x + father.width / 2 + mother.x + mother.width / 2) / 2;
              father.x = mid - father.width / 2 - H_SPACING / 2;
              mother.x = mid + H_SPACING / 2 - mother.width / 2;
            }
          }
          const parentsKey = father && mother
            ? `${child.fatherId}-${child.motherId}`
            : father
              ? `f-${child.fatherId}`
              : mother
                ? `m-${child.motherId}`
                : null;
          if (parentsKey) {
            if (!childrenByParents.has(parentsKey)) {
              childrenByParents.set(parentsKey, { father, mother, children: [] });
            }
            const entry = childrenByParents.get(parentsKey);
            if (entry) entry.children.push(childNode);
          }
        });
        if (i + CHUNK_SIZE < list.length) {
          await yieldToMainThread({ phase: 'align-couples' });
        }
      }

      childrenByParents.forEach(({ father, mother, children }) => {
        if (!children || children.length === 0) return;
        const center = (() => {
          if (father && mother) {
            return (
              father.x + father.width / 2 + (mother.x + mother.width / 2)
            ) / 2;
          }
          const p = father || mother;
          return p.x + p.width / 2;
        })();
        children.sort((a, b) => {
          const ak = Number.isFinite(a.birthSortKey) ? a.birthSortKey : 99999;
          const bk = Number.isFinite(b.birthSortKey) ? b.birthSortKey : 99999;
          return ak - bk;
        });
        const totalWidth = children.reduce(
          (sum, n, idx) =>
            sum + (n.width || DEFAULT_WIDTH) + (idx > 0 ? H_SPACING : 0),
          0
        );
        let x = center - totalWidth / 2;
        children.forEach((childNode, idx) => {
          const w = childNode.width || DEFAULT_WIDTH;
          childTargets.set(childNode.id, x);
          x += w + H_SPACING;
        });
        if (father && mother) {
          const unionKey = `u-${father.id}-${mother.id}`;
          childTargets.set(unionKey, center);
        }
      });

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
          await yieldToMainThread({ phase: 'links' });
        }
      }

      const nodesForSim = Array.from(map.values());
      nodesForSim.forEach((n) => {
        const g = gen.get(n.id) ?? 0;
        n.y = g * ROW_HEIGHT;
        n.fy = n.y;
        if (n.dateOfBirth || n.birthApprox) {
          const str = String(n.dateOfBirth || n.birthApprox);
          const m = str.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/);
          if (m) {
            const year = parseInt(m[1], 10);
            const month = m[2] ? parseInt(m[2], 10) : 6;
            const day = m[3] ? parseInt(m[3], 10) : 15;
            n.birthSortKey = year * 372 + (month - 1) * 31 + day;
          }
        }
      });

      const totalTicks = simulationTicks(nodesForSim.length);
      if (totalTicks > 0) {
        const linkForce = d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => (d.type === 'spouse' ? H_SPACING / 2 : H_SPACING))
          .strength(linkStrength);
        const collideForce = d3
          .forceCollide()
          .radius((d) => (d.width || DEFAULT_WIDTH) / 2 + H_SPACING / 2)
          .strength(collisionStrength);
        const sim = d3
          .forceSimulation(nodesForSim)
          .force('link', linkForce)
          .force('collide', collideForce)
          .alphaDecay(0.06)
          .velocityDecay(0.45)
          .stop();

        for (let i = 0; i < totalTicks; i += tickChunkSize) {
          const iterations = Math.min(tickChunkSize, totalTicks - i);
          for (let j = 0; j < iterations; j++) {
            sim.tick();
          }
          if (i + tickChunkSize < totalTicks) {
            await yieldToMainThread({ phase: 'simulation', progress: (i + iterations) / totalTicks });
          }
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
        // Prefer childTargets when available; else use current x
        rowNodes.forEach((n) => {
          if (childTargets.has(n.id)) {
            n.x = childTargets.get(n.id);
          } else if (!Number.isFinite(n.x)) {
            n.x = 0;
          }
        });
        // Sort by x, then by birthSortKey to stabilize
        rowNodes.sort((a, b) => (a.x - b.x) || ((a.birthSortKey ?? 99999999) - (b.birthSortKey ?? 99999999)));
        let lastX = Number.NEGATIVE_INFINITY;
        rowNodes.forEach((n) => {
          const half = (n.width || DEFAULT_WIDTH) / 2;
          if (n.x < lastX + half + H_SPACING / 2) {
            n.x = lastX + half + H_SPACING / 2;
          }
          lastX = n.x + half;
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