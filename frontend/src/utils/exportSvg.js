/* global d3 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.ExportSvg = factory();
  }
})(this, function () {
  function exportFamilyTree({ svgEl, data, selectedNodeId = null, bloodlineOnly = false }) {
    var d3lib = typeof d3 !== 'undefined' ? d3 : null;
    if (!d3lib && typeof require === 'function') {
      try { d3lib = require('d3'); } catch (e) { /* ignore */ }
    }
    if (!d3lib) throw new Error('d3 library not found');

    var hierarchy = d3lib.hierarchy;
    var d3tree = d3lib.tree;
    var linkHorizontal = d3lib.linkHorizontal;
    var extent = d3lib.extent;
    var create = d3lib.create;

    var svg;
    if (svgEl) {
      var bb;
      try {
        bb = svgEl.getBBox();
      } catch (e) {
        var rect = svgEl.getBoundingClientRect();
        bb = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      svg = svgEl.cloneNode(true);
      svg.setAttribute('viewBox', bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height);
      svg.setAttribute('width', bb.width);
      svg.setAttribute('height', bb.height);
    } else if (data) {
      // Layout tree using d3.hierarchy
      var root = hierarchy(data);
      var layout = d3tree().nodeSize([220, 130]);
      layout(root);
      var nodes = root.descendants();
      var links = root.links();

      var extX = extent(nodes, function (d) { return d.x; });
      var extY = extent(nodes, function (d) { return d.y; });
      var minX = extX[0];
      var maxX = extX[1];
      var minY = extY[0];
      var maxY = extY[1];
      var pad = 40;
      var w = maxX - minX + pad * 2;
      var h = maxY - minY + pad * 2;

      // Create SVG matching in-app vibe (light card look)
      svg = create('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('width', w)
        .attr('height', h)
        .attr('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + w + ' ' + h)
        .style('background', 'transparent');

      var defs = svg.append('defs');
      // subtle shadow
      var filter = defs.append('filter').attr('id', 'nodeShadow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
      filter.append('feDropShadow').attr('dx', '0').attr('dy', '4').attr('stdDeviation', '6').attr('flood-color', 'rgba(99, 102, 241, 0.25)');

      // edges
      svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 2)
        .style('filter', 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.2))')
        .selectAll('path')
        .data(links)
        .join('path')
        .attr('d', linkHorizontal()
          .x(function (d) { return d.x; })
          .y(function (d) { return d.y; })
          .source(function (d) { return d.source; })
          .target(function (d) { return d.target; }));

      var nodeG = svg.append('g');
      var node = nodeG.selectAll('g')
        .data(nodes)
        .join('g')
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      // card background
      node.append('rect')
        .attr('x', -85)
        .attr('y', -28)
        .attr('rx', 16)
        .attr('ry', 16)
        .attr('width', 170)
        .attr('height', 56)
        .attr('fill', '#ffffff')
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 2)
        .style('filter', 'url(#nodeShadow)')
        .attr('opacity', 1);

      // top accent bar like UI
      node.append('rect')
        .attr('x', -85)
        .attr('y', -28)
        .attr('width', 170)
        .attr('height', 3)
        .attr('fill', '#667eea');

      // avatar circle as gradient-ish solid
      node.append('circle')
        .attr('cx', -60)
        .attr('cy', 0)
        .attr('r', 16)
        .attr('fill', '#667eea')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 2);

      // name
      node.append('text')
        .attr('x', -34)
        .attr('y', -2)
        .attr('text-anchor', 'start')
        .attr('font-family', 'Inter, Arial, sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', '700')
        .attr('fill', '#1e293b')
        .text(function (d) { return (d.data.firstName || '') + ' ' + (d.data.lastName || ''); });

      // dates
      node.append('text')
        .attr('x', -34)
        .attr('y', 12)
        .attr('text-anchor', 'start')
        .attr('font-family', 'Inter, Arial, sans-serif')
        .attr('font-size', 10)
        .attr('fill', '#475569')
        .text(function (d) {
          var born = '';
          if (d.data.dateOfBirth) born = String(d.data.dateOfBirth).slice(0, 4);
          else if (d.data.birthApprox) born = d.data.birthApprox;
          var died = '';
          if (d.data.dateOfDeath) died = String(d.data.dateOfDeath).slice(0, 4);
          else if (d.data.deathApprox) died = d.data.deathApprox;
          return born + (died ? '\u2013' + died : '');
        });

      // highlight selected in bloodline mode
      if (bloodlineOnly && selectedNodeId) {
        node.selectAll('rect')
          .attr('stroke', function (d) { return d.data.id == selectedNodeId ? '#3b82f6' : '#e2e8f0'; })
          .attr('stroke-width', function (d) { return d.data.id == selectedNodeId ? 3 : 2; });

        // title
        svg.append('text')
          .attr('x', minX + w / 2 - pad)
          .attr('y', minY - pad + 24)
          .attr('text-anchor', 'middle')
          .attr('font-family', 'Inter, Arial, sans-serif')
          .attr('font-weight', '700')
          .attr('font-size', 16)
          .attr('fill', '#2c3e50')
          .text('Family Bloodline');
      }
    } else {
      throw new Error('exportFamilyTree: supply either svgEl or data');
    }

    var serialised = new XMLSerializer().serializeToString(svg.node ? svg.node() : svg);
    var blob = new Blob([serialised], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'BlauClan-' + (bloodlineOnly ? 'Bloodline-' : '') + Date.now() + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { exportFamilyTree: exportFamilyTree };
});
