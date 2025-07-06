/* global d3 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.ExportSvg = factory();
  }
})(this, function () {
  function exportFamilyTree({ svgEl, data, colors }) {
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
      var root = hierarchy(data);
      var layout = d3tree().nodeSize([120, 160]);
      layout(root);
      var nodes = root.descendants();
      var links = root.links();
      var extX = extent(nodes, function (d) { return d.x; });
      var extY = extent(nodes, function (d) { return d.y; });
      var minX = extX[0];
      var maxX = extX[1];
      var minY = extY[0];
      var maxY = extY[1];
      var pad = 20;
      var w = maxX - minX + pad * 2;
      var h = maxY - minY + pad * 2;
      svg = create('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('width', w)
        .attr('height', h)
        .attr('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + w + ' ' + h);

      svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-width', 2)
        .selectAll('path')
        .data(links)
        .join('path')
        .attr('d', linkHorizontal()
          .x(function (d) { return d.x; })
          .y(function (d) { return d.y; })
          .source(function (d) { return d.source; })
          .target(function (d) { return d.target; }));

      var nodeG = svg.append('g').attr('stroke', '#333').attr('stroke-width', 1);
      var node = nodeG.selectAll('g')
        .data(nodes)
        .join('g')
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      node.append('circle')
        .attr('r', 30)
        .attr('fill', function (d) { return colors[d.data.gender] || colors['?']; });

      node.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('fill', '#fff')
        .selectAll('tspan')
        .data(function (d) {
          var born = '';
          if (d.data.dateOfBirth) born = String(d.data.dateOfBirth).slice(0, 4);
          else if (d.data.birthApprox) born = d.data.birthApprox;
          var died = '';
          if (d.data.dateOfDeath) died = String(d.data.dateOfDeath).slice(0, 4);
          else if (d.data.deathApprox) died = d.data.deathApprox;
          return [d.data.firstName + ' ' + d.data.lastName, born + '\u2013' + died];
        })
        .join('tspan')
        .attr('x', 0)
        .attr('y', function (_, i) { return i * 14 - 6; })
        .text(function (s) { return s; });
    } else {
      throw new Error('exportFamilyTree: supply either svgEl or data');
    }

    var serialised = new XMLSerializer().serializeToString(svg.node ? svg.node() : svg);
    var blob = new Blob([serialised], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'BlauClan-' + Date.now() + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { exportFamilyTree: exportFamilyTree };
});
