/* global d3 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.ExportSvg = factory();
  }
})(this, function () {
  function exportFamilyTree({ svgEl, data, colors, selectedNodeId = null, bloodlineOnly = false }) {
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
      // Enhanced tree layout with better spacing
      var root = hierarchy(data);
      var layout = d3tree().nodeSize([140, 180]);
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
      
      // Create SVG with better styling
      svg = create('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('width', w)
        .attr('height', h)
        .attr('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + w + ' ' + h)
        .style('background', 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)');

      // Add background rectangle for better visual appeal
      svg.append('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'url(#backgroundGradient)')
        .attr('rx', 8);

      // Define gradients for better visual appeal
      var defs = svg.append('defs');
      
      // Background gradient
      defs.append('linearGradient')
        .attr('id', 'backgroundGradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%')
        .selectAll('stop')
        .data([
          { offset: '0%', color: '#f5f7fa' },
          { offset: '100%', color: '#c3cfe2' }
        ])
        .join('stop')
        .attr('offset', function(d) { return d.offset; })
        .attr('stop-color', function(d) { return d.color; });

      // Node gradients
      defs.append('radialGradient')
        .attr('id', 'maleGradient')
        .selectAll('stop')
        .data([
          { offset: '0%', color: '#4e79a7' },
          { offset: '100%', color: '#2c5aa0' }
        ])
        .join('stop')
        .attr('offset', function(d) { return d.offset; })
        .attr('stop-color', function(d) { return d.color; });

      defs.append('radialGradient')
        .attr('id', 'femaleGradient')
        .selectAll('stop')
        .data([
          { offset: '0%', color: '#f28e2b' },
          { offset: '100%', color: '#e67e22' }
        ])
        .join('stop')
        .attr('offset', function(d) { return d.offset; })
        .attr('stop-color', function(d) { return d.color; });

      defs.append('radialGradient')
        .attr('id', 'unknownGradient')
        .selectAll('stop')
        .data([
          { offset: '0%', color: '#bab0ab' },
          { offset: '100%', color: '#8a8178' }
        ])
        .join('stop')
        .attr('offset', function(d) { return d.offset; })
        .attr('stop-color', function(d) { return d.color; });

      // Enhanced links with better styling
      svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', '#666')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .selectAll('path')
        .data(links)
        .join('path')
        .attr('d', linkHorizontal()
          .x(function (d) { return d.x; })
          .y(function (d) { return d.y; })
          .source(function (d) { return d.source; })
          .target(function (d) { return d.target; }))
        .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

      // Enhanced nodes with better styling
      var nodeG = svg.append('g');
      var node = nodeG.selectAll('g')
        .data(nodes)
        .join('g')
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      // Add shadow filter for nodes
      defs.append('filter')
        .attr('id', 'nodeShadow')
        .append('feDropShadow')
        .attr('dx', '0')
        .attr('dy', '2')
        .attr('stdDeviation', '3')
        .attr('flood-color', 'rgba(0,0,0,0.2)');

      // Create enhanced node circles with gradients
      node.append('circle')
        .attr('r', 35)
        .attr('fill', function (d) { 
          var gender = d.data.gender || '?';
          return gender === 'male' ? 'url(#maleGradient)' : 
                 gender === 'female' ? 'url(#femaleGradient)' : 
                 'url(#unknownGradient)';
        })
        .attr('stroke', function(d) {
          // Highlight selected node with special border
          if (selectedNodeId && d.data.id == selectedNodeId) {
            return '#2c3e50';
          }
          return '#fff';
        })
        .attr('stroke-width', function(d) {
          return (selectedNodeId && d.data.id == selectedNodeId) ? 4 : 2;
        })
        .style('filter', 'url(#nodeShadow)');

      // Add generation indicator for bloodline view
      if (bloodlineOnly) {
        node.append('circle')
          .attr('r', 8)
          .attr('cx', 25)
          .attr('cy', -25)
          .attr('fill', '#e74c3c')
          .attr('stroke', '#fff')
          .attr('stroke-width', 1);
      }

      // Enhanced text with better typography
      var textGroup = node.append('g')
        .attr('text-anchor', 'middle');

      // Name text
      textGroup.append('text')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .attr('fill', '#fff')
        .attr('y', -8)
        .text(function (d) { 
          return d.data.firstName + ' ' + d.data.lastName; 
        });

      // Birth/death dates
      textGroup.append('text')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', 9)
        .attr('fill', '#fff')
        .attr('y', 4)
        .text(function (d) {
          var born = '';
          if (d.data.dateOfBirth) born = String(d.data.dateOfBirth).slice(0, 4);
          else if (d.data.birthApprox) born = d.data.birthApprox;
          var died = '';
          if (d.data.dateOfDeath) died = String(d.data.dateOfDeath).slice(0, 4);
          else if (d.data.deathApprox) died = d.data.deathApprox;
          return born + (died ? '\u2013' + died : '');
        });

      // Add place of birth if available
      textGroup.append('text')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', 8)
        .attr('fill', '#fff')
        .attr('y', 16)
        .text(function (d) {
          return d.data.placeOfBirth || '';
        });

      // Add title for bloodline view
      if (bloodlineOnly && selectedNodeId) {
        svg.append('text')
          .attr('x', w / 2)
          .attr('y', 30)
          .attr('text-anchor', 'middle')
          .attr('font-family', 'Arial, sans-serif')
          .attr('font-size', 16)
          .attr('font-weight', 'bold')
          .attr('fill', '#2c3e50')
          .text('Family Bloodline Tree');
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
