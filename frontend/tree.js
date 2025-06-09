(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.TreeApp = factory();
  }
})(this, function () {
  function init(app) {
    const svg = d3.select('#graph');
    const width = parseInt(svg.style('width')) || 800;
    const height = parseInt(svg.style('height')) || 600;

    let nodes = [];
    let links = [];
    const positions = {};

    function buildData() {
      nodes = app.people.map((p) => {
        const pos = positions[p.id];
        const node = {
          ...p,
          x: pos ? pos.x : Math.random() * width,
          y: pos ? pos.y : Math.random() * height,
        };
        node._new = !pos;
        if (!pos) {
          positions[p.id] = { x: node.x, y: node.y };
        }
        return node;
      });
      links = [];
      app.people.forEach((p) => {
        if (p.fatherId) links.push({ source: p.fatherId, target: p.id });
        if (p.motherId) links.push({ source: p.motherId, target: p.id });
      });
    }

    const simulation = d3
      .forceSimulation()
      .force('link', d3.forceLink().id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .stop();

    function runLayout() {
      simulation.nodes(nodes);
      nodes.forEach((n) => {
        if (!n._new) {
          n.fx = n.x;
          n.fy = n.y;
        } else {
          n.fx = n.fy = undefined;
        }
      });
      simulation.force('link').links(links);
      simulation.alpha(1);
      for (let i = 0; i < 50; i++) simulation.tick();
      nodes.forEach((n) => {
        n.fx = n.fy = null;
        n._new = false;
        positions[n.id] = { x: n.x, y: n.y };
      });
    }

    function update() {
      buildData();
      runLayout();

      const link = svg
        .selectAll('line.link')
        .data(links, (d) => d.source + '-' + d.target);

      link
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', '#999');

      link.exit().remove();

      const node = svg
        .selectAll('g.node')
        .data(nodes, (d) => d.id);

      const nodeEnter = node
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(
          d3
            .drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
        )
        .on('mousedown', startLink)
        .on('click', (_, d) => app.selectPerson(d));

      nodeEnter
        .append('rect')
        .attr('width', 100)
        .attr('height', 40)
        .attr('x', -50)
        .attr('y', -20)
        .attr('rx', 6)
        .attr('fill', '#fff')
        .attr('stroke', '#69b3a2');

      nodeEnter
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 5)
        .text((d) => `${d.firstName} ${d.lastName}`);

      node.exit().remove();
      updatePositions();
    }

    function updatePositions() {
      svg
        .selectAll('line.link')
        .attr('x1', (d) => getNodeById(d.source).x)
        .attr('y1', (d) => getNodeById(d.source).y)
        .attr('x2', (d) => getNodeById(d.target).x)
        .attr('y2', (d) => getNodeById(d.target).y);

      svg
        .selectAll('g.node')
        .attr('transform', (d) => `translate(${d.x},${d.y})`);
    }

    function getNodeById(id) {
      return nodes.find((n) => n.id === (typeof id === 'object' ? id.id : id));
    }

    function dragstarted(_event, _d) {}

    function dragged(event, d) {
      d.x = event.x;
      d.y = event.y;
      positions[d.id] = { x: d.x, y: d.y };
      updatePositions();
    }

    function dragended(_event, _d) {}

    let tempLink = null;
    function startLink(event, d) {
      event.stopPropagation();
      tempLink = { source: d, target: { x: event.x, y: event.y } };
      svg
        .append('line')
        .attr('class', 'temp-link')
        .attr('stroke', '#666')
        .attr('x1', d.x)
        .attr('y1', d.y)
        .attr('x2', d.x)
        .attr('y2', d.y);
      svg.on('mousemove.temp', dragLink).on('mouseup.temp', endLink);
    }

    function dragLink(event) {
      if (!tempLink) return;
      svg
        .select('line.temp-link')
        .attr('x2', event.offsetX)
        .attr('y2', event.offsetY);
    }

    function endLink(event) {
      svg.on('.temp', null);
      const [mx, my] = d3.pointer(event);
      const target = nodes.find(
        (n) => Math.hypot(n.x - mx, n.y - my) < 20
      );
      svg.selectAll('line.temp-link').remove();
      if (tempLink && target && target !== tempLink.source) {
        const child = target;
        const parent = tempLink.source;
        createParentChild(parent, child);
      }
      tempLink = null;
    }

    async function createParentChild(parent, child) {
      const updates = {};
      if (!child.fatherId) updates.fatherId = parent.id;
      else if (!child.motherId) updates.motherId = parent.id;
      else {
        alert('Both parents already set for this person.');
        return;
      }
      try {
        const updated = await FrontendApp.updatePerson(child.id, updates);
        Object.assign(child, updated);
        update();
      } catch (e) {
        console.error(e);
      }
    }

    app.$watch(
      () => app.people,
      () => update(),
      { deep: true }
    );

    update();

    return { update };
  }

  return { init };
});
