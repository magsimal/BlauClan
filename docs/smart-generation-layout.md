# Smarter Tidy-Up Pass

This document describes a D3-based layout algorithm that keeps spouses and their siblings aligned on the same generation row, even when parent records are missing.

## Why the Original Approach Fails

D3's `tree()` layout determines the vertical coordinate based solely on the distance to a synthetic root. If one spouse has known parents while the other does not, the couple ends up at different depths. They appear on separate rows even though they belong to the same generation.

## High-Level Strategy

1. **Collapse generation-equivalent people into groups**
   - Two people belong to the same **GenGroup** if they are married or share at least one parent.
2. **Assign an integer generation to each GenGroup**
   - A group's generation equals `max(parent groups) + 1`.
   - When parent information is missing, spouse or sibling links pull members to the correct row.
3. **Run `d3.tree()` for horizontal spacing**
   - After `tree()` computes the x‑coordinate, overwrite `y` with `gen × rowHeight`.
4. **Optional marriage nodes**
   - Insert invisible nodes per couple so children connect to the midpoint between parents and avoid "V" shapes.

## Detailed Algorithm

### Types

```ts
interface Person {
  id: string;
  motherId?: string;
  fatherId?: string;
  spouseIds: string[];
}

interface GenGroup {
  id: number;
  members: Set<string>;
}
```

### Phase 1 – Build Generation-Equivalence Classes

Use a Union–Find structure to merge spouses and siblings:

```ts
class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string { /* path compression */ }
  union(a: string, b: string) { /* union by rank */ }
}
```

1. Create singleton sets for all persons.
2. Union siblings that share at least one parent.
3. Union all spouse pairs.
4. Convert the disjoint sets to `GenGroup` objects.

### Phase 2 – Assign Generation Numbers

1. Construct a DAG of GenGroups, where edges point from parent groups to child groups.
2. Perform a topological longest-path pass to assign generation indices.
3. Unconnected groups default to generation 0.
4. Propagate the generation number to every person.

### Phase 3 – Layout With D3

1. Build a tree with any convenient root (possibly a fake root).
2. Run `d3.tree()` for x-positions.
3. Set `y = generation * rowHeight` when rendering nodes.

### Phase 4 – Marriage Dummy Nodes (Optional)

Create a synthetic node for each spouse pair:

- ID format: `marriage:a:b`.
- Children: all biological children of the couple.
- Parents: the parents of either spouse, or the fake root if unknown.

Link the real spouses as side-by-side children of this dummy node to center them above their children.

## Complexity Overview

| Step | Time | Space |
|------|------|-------|
| Union–Find | O(n α(n)) | O(n) |
| Build edges | O(e) | O(n) |
| Topological layering | O(n + e) | O(n) |
| D3 `tree()` | O(n) | O(n) |

Here `α(n)` is the inverse Ackermann function, effectively constant for practical input sizes.

## TypeScript Helper

Implement phases 1 and 2 as a reusable function:

```ts
export function assignGenerations(persons: Person[]): Map<string, number> {
  // ...implementation of grouping and generation assignment...
}
```

Example usage:

```ts
const gen = assignGenerations(store.members);
const layout = tree<Person>().size([width, 1])(hierarchy(fakeRoot));
svg.selectAll('g.person')
   .data(layout.descendants())
   .attr('transform', d => `translate(${d.x}, ${gen.get(d.data.id)! * rowH})`);
```

## Benefits

- Spouses and siblings always share a row.
- No external dependencies beyond TypeScript and D3.
- Runs in linear time even for large trees.
- Easy to extend for half-siblings, adoptive links, or birth-year heuristics.

