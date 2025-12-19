const clonePerson = (person) => {
  if (!person) return null;
  if (typeof person.toJSON === 'function') return person.toJSON();
  if (typeof person.get === 'function') return person.get({ plain: true });
  return { ...person };
};

function computeMetrics(peopleInput = []) {
  const plainPeople = peopleInput.map(clonePerson).filter((p) => p && typeof p.id !== 'undefined');
  const byId = new Map(plainPeople.map((p) => [p.id, p]));
  const childCounts = new Map();

  for (const person of plainPeople) {
    if (person.fatherId && byId.has(person.fatherId)) {
      childCounts.set(person.fatherId, (childCounts.get(person.fatherId) || 0) + 1);
    }
    if (person.motherId && byId.has(person.motherId)) {
      childCounts.set(person.motherId, (childCounts.get(person.motherId) || 0) + 1);
    }
  }

  const depthCache = new Map();
  const visiting = new Set();

  const ancestryDepth = (id) => {
    if (!id || !byId.has(id)) return 0;
    if (depthCache.has(id)) return depthCache.get(id);
    if (visiting.has(id)) return 0;

    visiting.add(id);
    const person = byId.get(id);
    const parentIds = [person.fatherId, person.motherId].filter((pid) => pid && byId.has(pid));

    let depth = 0;
    if (parentIds.length) {
      let maxParentDepth = 0;
      for (const parentId of parentIds) {
        const candidateDepth = ancestryDepth(parentId);
        if (candidateDepth > maxParentDepth) maxParentDepth = candidateDepth;
      }
      depth = maxParentDepth + 1;
    }

    visiting.delete(id);
    depthCache.set(id, depth);
    return depth;
  };

  const metrics = new Map();
  for (const person of plainPeople) {
    metrics.set(person.id, {
      childCount: childCounts.get(person.id) || 0,
      ancestryDepth: ancestryDepth(person.id),
    });
  }

  return { metrics, people: plainPeople };
}

function attachMetricsToPeople(peopleInput = []) {
  const { metrics, people } = computeMetrics(peopleInput);
  return people.map((person) => ({ ...person, ...metrics.get(person.id) }));
}

function buildMetricsMap(peopleInput = []) {
  return computeMetrics(peopleInput).metrics;
}

module.exports = {
  attachMetricsToPeople,
  buildMetricsMap,
};
