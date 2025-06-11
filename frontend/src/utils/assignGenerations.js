(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.GenerationLayout = factory();
  }
})(this, function () {
  class UnionFind {
    constructor(ids) {
      this.parent = new Map();
      this.rank = new Map();
      ids.forEach((id) => {
        this.parent.set(id, id);
        this.rank.set(id, 0);
      });
    }
    find(x) {
      let p = this.parent.get(x);
      if (p === undefined) return undefined;
      if (p !== x) {
        p = this.find(p);
        this.parent.set(x, p);
      }
      return p;
    }
    union(a, b) {
      const rootA = this.find(a);
      const rootB = this.find(b);
      if (rootA === undefined || rootB === undefined) return;
      if (rootA === rootB) return;
      let rankA = this.rank.get(rootA);
      let rankB = this.rank.get(rootB);
      if (rankA < rankB) {
        this.parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        this.parent.set(rootB, rootA);
      } else {
        this.parent.set(rootB, rootA);
        this.rank.set(rootA, rankA + 1);
      }
    }
  }

  function assignGenerations(persons) {
    const ids = persons.map((p) => p.id);
    const uf = new UnionFind(ids);

    const byMother = new Map();
    const byFather = new Map();

    persons.forEach((p) => {
      if (p.motherId) {
        if (!byMother.has(p.motherId)) byMother.set(p.motherId, []);
        byMother.get(p.motherId).push(p.id);
      }
      if (p.fatherId) {
        if (!byFather.has(p.fatherId)) byFather.set(p.fatherId, []);
        byFather.get(p.fatherId).push(p.id);
      }
    });

    const unionSiblings = (map) => {
      map.forEach((children) => {
        for (let i = 1; i < children.length; i++) {
          uf.union(children[0], children[i]);
        }
      });
    };

    unionSiblings(byMother);
    unionSiblings(byFather);

    persons.forEach((p) => {
      (p.spouseIds || []).forEach((s) => {
        uf.union(p.id, s);
      });
    });

    const repToMembers = new Map();
    persons.forEach((p) => {
      const root = uf.find(p.id);
      if (!repToMembers.has(root)) repToMembers.set(root, new Set());
      repToMembers.get(root).add(p.id);
    });

    const groupOfRoot = new Map();
    let idx = 0;
    repToMembers.forEach((members, root) => {
      groupOfRoot.set(root, idx++);
    });

    const personGroup = new Map();
    repToMembers.forEach((members, root) => {
      const gid = groupOfRoot.get(root);
      members.forEach((id) => personGroup.set(id, gid));
    });

    const dag = new Map();
    for (let i = 0; i < idx; i++) {
      dag.set(i, { children: new Set(), indegree: 0, generation: undefined });
    }

    persons.forEach((child) => {
      ['motherId', 'fatherId'].forEach((key) => {
        const pid = child[key];
        if (!pid) return;
        const pg = personGroup.get(pid);
        const cg = personGroup.get(child.id);
        if (pg === undefined || cg === undefined || pg === cg) return;
        const parentNode = dag.get(pg);
        const childNode = dag.get(cg);
        if (!parentNode.children.has(cg)) {
          parentNode.children.add(cg);
          childNode.indegree++;
        }
      });
    });

    const queue = [];
    dag.forEach((node, gid) => {
      if (node.indegree === 0) {
        node.generation = 0;
        queue.push(gid);
      }
    });

    while (queue.length) {
      const gid = queue.shift();
      const node = dag.get(gid);
      node.children.forEach((cId) => {
        const child = dag.get(cId);
        const gen = (node.generation || 0) + 1;
        if (child.generation === undefined || gen > child.generation) {
          child.generation = gen;
        }
        child.indegree--;
        if (child.indegree === 0) queue.push(cId);
      });
    }

    dag.forEach((node) => {
      if (node.generation === undefined) node.generation = 0;
    });

    const result = new Map();
    persons.forEach((p) => {
      const gid = personGroup.get(p.id);
      result.set(p.id, dag.get(gid).generation);
    });

    return result;
  }

  return { assignGenerations };
});
