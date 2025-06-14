(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowApp = factory();
  }
})(this, function () {
  /* global html2canvas, d3, GenerationLayout, AppConfig */
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function mount() {
    const { createApp, ref, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
    const { VueFlow, MarkerType, Handle, useZoomPanHelper, useVueFlow } = window.VueFlow;

    const app = createApp({
      components: { VueFlow, Handle },
      setup() {
        const nodes = ref([]);
        const edges = ref([]);
        const selectedEdge = ref(null);
        const { fitView } = useZoomPanHelper();
        const {
          screenToFlowCoordinate,
          project,
          dimensions,
          addSelectedNodes,
          removeSelectedNodes,
          snapToGrid,
          snapGrid,
        } = useVueFlow();
        const gridSize = (window.AppConfig && AppConfig.gridSize) || 30;
        const selected = ref(null);
        const showModal = ref(false);
        const contextMenuVisible = ref(false);
        const contextX = ref(0);
        const contextY = ref(0);
        let longPressTimer = null;
        const UNION_Y_OFFSET = 20;
        let unions = {};
        let newNodePos = null;

        function addClass(edge, cls) {
          const parts = (edge.class || '').split(' ').filter(Boolean);
          if (!parts.includes(cls)) parts.push(cls);
          edge.class = parts.join(' ');
        }

        function removeClass(edge, cls) {
          if (!edge.class) return;
          edge.class = edge.class
            .split(' ')
            .filter((c) => c !== cls)
            .join(' ');
        }

        function avatarSrc(gender, size) {
          void size; // size parameter kept for compatibility
          const g = (gender || '').toString().toLowerCase();
          if (g === 'male' || g === 'm') {
            return 'https://placehold.net/avatar-2.png';
          }
          return 'https://placehold.net/avatar.png';
        }

        async function applySavedLayout() {
          const res = await fetch('/api/layout');
          if (!res.ok) return;
          const layout = await res.json();
          if (!layout) return;
          const map = {};
          layout.nodes.forEach((n) => {
            map[n.id] = n;
          });
          nodes.value.forEach((n) => {
            if (map[n.id]) {
              n.position = { x: map[n.id].x, y: map[n.id].y };
            }
          });
        }

        async function load(preservePositions = false) {
          const existingPos = {};
          if (preservePositions) {
            nodes.value.forEach((n) => {
              existingPos[n.id] = { ...n.position };
            });
          }
          const people = await FrontendApp.fetchPeople();
          const idMap = {};
          people.forEach((p) => (idMap[p.id] = p));

          // determine generation levels
          const queue = [];
          people.forEach((p) => {
            p._gen = null;
            if (!p.fatherId && !p.motherId) {
              p._gen = 0;
              queue.push(p);
            }
          });
          while (queue.length) {
            const cur = queue.shift();
            const g = cur._gen || 0;
            people.forEach((c) => {
              if ((c.fatherId === cur.id || c.motherId === cur.id) && c._gen === null) {
                c._gen = g + 1;
                queue.push(c);
              }
            });
          }
          people.forEach((p) => {
            if (p._gen === null) p._gen = 0;
          });

          const layers = {};
          people.forEach((p) => {
            layers[p._gen] = layers[p._gen] || [];
            layers[p._gen].push(p);
          });

          const positions = {};
          const xSpacing = 180;
          const ySpacing = 150;
          Object.keys(layers).forEach((g) => {
            layers[g].forEach((p, idx) => {
              positions[p.id] = { x: 100 + idx * xSpacing, y: 100 + g * ySpacing };
            });
          });

          nodes.value = people.map((p) => ({
            id: String(p.id),
            type: 'person',
            position: existingPos[p.id] || positions[p.id],
            data: { ...p },
          }));

          unions = {};
          edges.value = [];
          selectedEdge.value = null;

          function unionKey(f, m) {
            return `${f}-${m}`;
          }

          people.forEach((child) => {
            if (child.fatherId && child.motherId) {
              const key = unionKey(child.fatherId, child.motherId);
              if (!unions[key]) {
                const id = `u-${key}`;
                const midX =
                  (positions[child.fatherId].x + positions[child.motherId].x) / 2;
                const midY =
                  (positions[child.fatherId].y + positions[child.motherId].y) /
                    2 +
                  UNION_Y_OFFSET;
                const pos = {
                  x: midX,
                  y: midY,
                };
                unions[key] = {
                  id,
                  fatherId: child.fatherId,
                  motherId: child.motherId,
                  children: [],
                };
                nodes.value.push({
                  id,
                  type: 'helper',
                  position: existingPos[id] || pos,
                  data: { _gen: idMap[child.fatherId]._gen, helper: true },
                  draggable: false,
                  selectable: false,
                });
                positions[id] = pos;
              }
              unions[key].children.push(child.id);
            }
          });

          Object.values(unions).forEach((m) => {
            edges.value.push({
              id: `spouse-line-${m.id}`,
              source: String(m.fatherId),
              target: String(m.motherId),
              type: 'straight',
              sourceHandle: 's-right',
              targetHandle: 't-left',
            });

            m.children.forEach((cid) => {
                edges.value.push({
                  id: `${m.id}-${cid}`,
                  source: m.id,
                  target: String(cid),
                  type: 'default',
                  markerEnd: MarkerType.ArrowClosed,
                  sourceHandle: 's-bottom',
                  targetHandle: 't-top',
                });
            });
          });

          people.forEach((p) => {
            if ((p.fatherId && !p.motherId) || (!p.fatherId && p.motherId)) {
              const parent = p.fatherId || p.motherId;
              edges.value.push({
                id: `p-${p.id}`,
                source: String(parent),
                target: String(p.id),
                markerEnd: MarkerType.ArrowClosed,
                sourceHandle: 's-bottom',
                targetHandle: 't-top',
              });
            }
          });

          // remove Vue internal refs that cause warnings when passed as props
          edges.value = edges.value.map((edge) => {
            const { ref: _unused, ...rest } = edge;
            void _unused; // avoid eslint no-unused-vars warning
            return rest;
          });

          await applySavedLayout();
          await nextTick();
          refreshUnions();
        }

        const children = ref([]);

        function computeChildren(pid) {
          children.value = nodes.value
            .filter((n) => n.data.fatherId === pid || n.data.motherId === pid)
            .map((n) => n.data);
        }

        function handleKeydown(ev) {
          if (ev.key === 'Shift') {
            shiftPressed.value = true;
          }
          if (ev.shiftKey && ev.altKey && ev.key.toLowerCase() === 't') {
            ev.preventDefault();
            tidyUpLayout();
            return;
          }
          if (ev.key !== 'Delete' || !selectedEdge.value) return;
          ev.preventDefault();
          removeSelectedEdge();
        }

        function handleKeyup(ev) {
          if (ev.key === 'Shift') {
            shiftPressed.value = false;
          }
        }

        async function removeSelectedEdge() {
          const edge = selectedEdge.value;
          if (!edge) return;
          selectedEdge.value = null;
          edges.value.forEach((e) => removeClass(e, 'selected-edge'));

          if (edge.id.startsWith('spouse-line')) {
            const fatherId = parseInt(edge.source, 10);
            const motherId = parseInt(edge.target, 10);
            const list = await FrontendApp.fetchSpouses(fatherId);
            const rel = list.find((s) => s.spouse.id === motherId);
            if (rel) {
              await FrontendApp.deleteSpouse(fatherId, rel.marriageId);
            }
              await load(true);
              return;
          }

          let parentId;
          let childId;
          if (edge.targetHandle === 't-top') {
            parentId = parseInt(edge.source, 10);
            childId = parseInt(edge.target, 10);
          } else if (edge.sourceHandle === 't-top') {
            parentId = parseInt(edge.target, 10);
            childId = parseInt(edge.source, 10);
          } else if (edge.sourceHandle === 's-bottom') {
            parentId = parseInt(edge.source, 10);
            childId = parseInt(edge.target, 10);
          } else if (edge.targetHandle === 's-bottom' || edge.targetHandle === 't-bottom') {
            parentId = parseInt(edge.target, 10);
            childId = parseInt(edge.source, 10);
          } else if (edge.source.startsWith('u-') || edge.target.startsWith('u-')) {
            const cid = edge.source.startsWith('u-') ? parseInt(edge.target, 10) : parseInt(edge.source, 10);
            await FrontendApp.updatePerson(cid, { fatherId: null, motherId: null });
              await load(true);
              return;
          } else {
            return;
          }

          const childNode = nodes.value.find((n) => n.id === String(childId));
          if (!childNode) return;
          const parentNode = nodes.value.find((n) => n.id === String(parentId));
          const updates = {};
          const gender = (parentNode?.data.gender || '').toLowerCase();
          if (gender === 'female' && childNode.data.motherId === parentId) updates.motherId = null;
          else if (gender === 'male' && childNode.data.fatherId === parentId) updates.fatherId = null;
          else {
            if (childNode.data.fatherId === parentId) updates.fatherId = null;
            if (childNode.data.motherId === parentId) updates.motherId = null;
          }
            if (Object.keys(updates).length) {
              await FrontendApp.updatePerson(childId, updates);
              await load(true);
            }
        }

        const shiftPressed = ref(false);

        onMounted(async () => {
          await load();
          fitView();
          snapGrid.value = [gridSize, gridSize];
          window.addEventListener('keydown', handleKeydown);
          window.addEventListener('keyup', handleKeyup);
        });

        onBeforeUnmount(() => {
          window.removeEventListener('keydown', handleKeydown);
          window.removeEventListener('keyup', handleKeyup);
        });
        const editing = ref(false);

        let clickTimer = null;

        function clearHighlights() {
          nodes.value.forEach((n) => {
            if (n.data) n.data.highlight = false;
          });
          edges.value.forEach((e) => {
            e.class = '';
          });
        }

        function highlightBloodline(id) {
          clearHighlights();

          const map = {};
          nodes.value.forEach((n) => {
            map[n.id] = n;
          });

          const visitedUp = new Set();
          const visitedDown = new Set();

          function unionId(f, m) {
            return `u-${f}-${m}`;
          }

          function markNode(nId) {
            const node = map[String(nId)];
            if (node && node.data) node.data.highlight = true;
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
            nodes.value.forEach((child) => {
              if (
                child.data.fatherId === pid ||
                child.data.motherId === pid
              ) {
                if (child.data.fatherId && child.data.motherId) {
                  const uId = unionId(child.data.fatherId, child.data.motherId);
                  markNode(uId);
                }
                highlightDescendants(parseInt(child.id));
              }
            });
          }

          highlightAncestors(id);
          highlightDescendants(id);

          edges.value.forEach((edge) => {
            const sel = edge === selectedEdge.value;
            if (edge.id.startsWith('spouse-line')) {
              edge.class = sel ? 'selected-edge' : 'faded-edge';
              return;
            }
            const src = map[edge.source];
            const tgt = map[edge.target];
            if (src?.data.highlight && tgt?.data.highlight) {
              edge.class = sel ? 'selected-edge' : 'highlight-edge';
            } else {
              edge.class = sel ? 'selected-edge' : 'faded-edge';
            }
          });
        }

        function onNodeClick(evt) {
          const e = evt.event || evt;
          if (e.shiftKey || shiftPressed.value) {
            if (evt.node.selected) removeSelectedNodes([evt.node]);
            else addSelectedNodes([evt.node]);
            return;
          }
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            selected.value = { ...evt.node.data, spouseId: '' };
            computeChildren(evt.node.data.id);
            editing.value = false;
            showModal.value = true;
          } else {
            selected.value = { ...evt.node.data, spouseId: '' };
            computeChildren(evt.node.data.id);
            editing.value = false;
            showModal.value = false;
            highlightBloodline(evt.node.data.id);
            clickTimer = setTimeout(() => {
              clickTimer = null;
            }, 250);
          }
        }

       function onPaneClick() {
         selected.value = null;
         showModal.value = false;
         editing.value = false;
         clearHighlights();
         contextMenuVisible.value = false;
       }

        function onEdgeClick(evt) {
          selectedEdge.value = evt.edge;
          edges.value.forEach((e) => removeClass(e, 'selected-edge'));
          addClass(evt.edge, 'selected-edge');
        }

          const saveSelected = debounce(async () => {
            if (!selected.value) return;
            const payload = { ...selected.value };
            const spouseId = payload.spouseId;
            delete payload.spouseId;
            ['maidenName', 'dateOfBirth', 'dateOfDeath', 'placeOfBirth', 'notes', 'fatherId', 'motherId'].forEach((f) => {
              if (payload[f] === '') payload[f] = null;
            });
            const updated = await FrontendApp.updatePerson(selected.value.id, payload);
            // Avoid overwriting fields the user may still be typing
            if (spouseId) {
              await FrontendApp.linkSpouse(updated.id, parseInt(spouseId));
            }
              await load(true);
              computeChildren(updated.id);
          }, 200);

        watch(
          () => selected.value,
          () => {
            if (editing.value && showModal.value && !isNew.value) saveSelected();
          },
          { deep: true }
        );

        watch(shiftPressed, (val) => {
          document.body.classList.toggle('multi-select-active', val);
          const ind = document.getElementById('multiIndicator');
          if (ind) ind.style.display = val ? 'block' : 'none';
        });

        function onNodeDragStop() {
          refreshUnions();
        }

        async function saveLayout() {
          const payload = {
            nodes: nodes.value.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
          };
          await fetch('/api/layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }

        async function loadLayout() {
          await applySavedLayout();
          refreshUnions();
        }

        async function downloadPng() {
          fitView();
          await nextTick();
          const container = document.querySelector('#flow-app .vue-flow');
          if (!container || typeof html2canvas === 'undefined') return;

          const toolbar = document.getElementById('toolbar');
          const originalDisplay = toolbar ? toolbar.style.display : '';
          if (toolbar) toolbar.style.display = 'none';

          const canvas = await html2canvas(container, { useCORS: true });

          const rect = container.getBoundingClientRect();
          const elements = container.querySelectorAll(
            '.vue-flow__node, .vue-flow__edge-path'
          );
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          elements.forEach((el) => {
            const r = el.getBoundingClientRect();
            const left = r.left - rect.left;
            const top = r.top - rect.top;
            const right = r.right - rect.left;
            const bottom = r.bottom - rect.top;
            if (left < minX) minX = left;
            if (top < minY) minY = top;
            if (right > maxX) maxX = right;
            if (bottom > maxY) maxY = bottom;
          });

          const margin = 20;
          minX = Math.max(minX - margin, 0);
          minY = Math.max(minY - margin, 0);
          maxX = Math.min(maxX + margin, canvas.width);
          maxY = Math.min(maxY + margin, canvas.height);

          const width = maxX - minX;
          const height = maxY - minY;
          const croppedCanvas = document.createElement('canvas');
          croppedCanvas.width = width;
          croppedCanvas.height = height;
          const ctx = croppedCanvas.getContext('2d');
          ctx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

          const url = croppedCanvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = url;
          link.download = 'family-tree.png';
          link.click();

          if (toolbar) toolbar.style.display = originalDisplay;
        }

        function buildHierarchy() {
          const map = {};
          nodes.value.forEach((n) => {
            if (!n.data || n.data.helper) return;
            map[n.data.id] = { ...n.data, children: [] };
          });
          Object.values(map).forEach((p) => {
            const parent = map[p.fatherId] || map[p.motherId];
            if (parent) parent.children.push(p);
          });
          return {
            children: Object.values(map).filter(
              (p) => !map[p.fatherId] && !map[p.motherId]
            ),
          };
        }

        function downloadSvg() {
          const treeData = buildHierarchy();
          const exporter = window.ExportSvg;
          if (exporter && typeof exporter.exportFamilyTree === 'function') {
            exporter.exportFamilyTree({
              data: treeData,
              svgEl: null,
              colors: { male: '#4e79a7', female: '#f28e2b', '?': '#bab0ab' },
            });
          } else {
            console.error('ExportSvg utility not loaded');
          }
        }

        function toggleSnap() {
          snapToGrid.value = !snapToGrid.value;
        }

        async function onConnect(params) {
          const sH = params.sourceHandle || '';
          const tH = params.targetHandle || '';
          const src = nodes.value.find((n) => n.id === params.source);
          const tgt = nodes.value.find((n) => n.id === params.target);
          if (!src || !tgt) return;

          if (
            (sH.includes('left') || sH.includes('right')) &&
            (tH.includes('left') || tH.includes('right'))
          ) {
              await FrontendApp.linkSpouse(
                parseInt(params.source),
                parseInt(params.target)
              );
              await load(true);
              return;
          }

          let parentNode;
          let childNode;
          if (tH.includes('top')) {
            parentNode = src;
            childNode = tgt;
          } else if (sH.includes('top')) {
            parentNode = tgt;
            childNode = src;
          } else if (sH.includes('bottom')) {
            parentNode = src;
            childNode = tgt;
          } else if (tH.includes('bottom')) {
            parentNode = tgt;
            childNode = src;
          } else {
            return;
          }

          const updates = {};
          const gender = (parentNode.data.gender || '').toLowerCase();
          if (gender === 'female') updates.motherId = parentNode.data.id;
          else if (gender === 'male') updates.fatherId = parentNode.data.id;
          else if (!childNode.data.fatherId) updates.fatherId = parentNode.data.id;
          else if (!childNode.data.motherId) updates.motherId = parentNode.data.id;
          else return;

          await FrontendApp.updatePerson(childNode.data.id, updates);
          await load(true);
        }

        const isNew = ref(false);

        function addPerson(pos) {
          selected.value = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            notes: '',
            gender: '',
            fatherId: '',
            motherId: '',
            spouseId: '',
          };
          if (!pos) {
            pos = project({
              x: dimensions.value.width / 2,
              y: dimensions.value.height / 2,
            });
          }
          newNodePos = pos;
          isNew.value = true;
          editing.value = true;
          showModal.value = true;
        }

        function addChild() {
          const base = { ...selected.value };
          selected.value = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            notes: '',
            gender: '',
            fatherId: base.gender === 'female' ? '' : base.id,
            motherId: base.gender === 'female' ? base.id : '',
            spouseId: '',
          };
          isNew.value = true;
          editing.value = true;
        }

        function addSpouse() {
          const base = { ...selected.value };
          selected.value = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            notes: '',
            gender: '',
            fatherId: '',
            motherId: '',
            spouseId: base.id,
          };
          isNew.value = true;
          editing.value = true;
        }

        function addParent(type) {
          const childId = selected.value.id;
          selected.value = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            notes: '',
            gender: '',
            fatherId: '',
            motherId: '',
            spouseId: '',
            relation: { type, childId },
          };
          isNew.value = true;
          editing.value = true;
        }

        async function deleteSelected() {
          if (!selected.value) return;
          const id = selected.value.id;
          showModal.value = false;
          await FrontendApp.deletePerson(id);
          selected.value = null;
          await load(true);
        }

        async function unlinkChild(child) {
          const updates = {};
          if (child.fatherId === selected.value.id) updates.fatherId = null;
          if (child.motherId === selected.value.id) updates.motherId = null;
          await FrontendApp.updatePerson(child.id, updates);
          await load(true);
          computeChildren(selected.value.id);
        }

        function refreshUnions() {
          Object.values(unions).forEach((u) => {
            const father = nodes.value.find((n) => n.id === String(u.fatherId));
            const mother = nodes.value.find((n) => n.id === String(u.motherId));
            const helper = nodes.value.find((n) => n.id === u.id);
            if (father && mother && helper) {
              const fatherWidth = father.dimensions?.width || 0;
              const motherWidth = mother.dimensions?.width || 0;
              const fatherHeight = father.dimensions?.height || 0;
              const motherHeight = mother.dimensions?.height || 0;
              helper.position = {
                x:
                  (father.position.x + fatherWidth / 2 +
                    mother.position.x +
                    motherWidth / 2) /
                  2,
                y:
                  (father.position.y + fatherHeight / 2 +
                    mother.position.y +
                    motherHeight / 2) /
                    2 +
                  UNION_Y_OFFSET,
              };

              const spEdge = edges.value.find(
                (e) => e.id === `spouse-line-${u.id}`
              );
              if (spEdge) {
                spEdge.sourceHandle = 's-right';
                spEdge.targetHandle = 't-left';
              }

              u.children.forEach((cid) => {
                const edge = edges.value.find((e) => e.id === `${u.id}-${cid}`);
                const childNode = nodes.value.find((n) => n.id === String(cid));
                if (edge && childNode) {
                  edge.sourceHandle = 's-bottom';
                  edge.targetHandle = 't-top';
                }
              });
            }
          });
        }

        function tidyUp(list) {
          const map = new Map(list.map((n) => [n.id, { ...n, children: [] }]));
          map.forEach((n) => {
            if (n.motherId && map.has(n.motherId)) map.get(n.motherId).children.push(n);
            if (n.fatherId && map.has(n.fatherId)) map.get(n.fatherId).children.push(n);
          });

          const gen = GenerationLayout.assignGenerations(list);
          const ROW_HEIGHT = 230;

          const roots = [];
          map.forEach((n) => {
            const hasParent = list.some((p) => p.id === n.motherId || p.id === n.fatherId);
            if (!hasParent && n.children.length) roots.push(n);
          });
          const fakeRoot = { id: 'root', children: roots };
          const layout = d3.tree().nodeSize([120, 1]);
          const rootNode = d3.hierarchy(fakeRoot);
          layout(rootNode);

          rootNode.children.forEach(walk);
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
                  const mid = (father.x + mother.x) / 2;
                  father.x = mid - 60;
                  mother.x = mid + 60;
                }
              }
            }
          });

          const rows = new Map();
          list.forEach((n) => {
            const g = gen.get(n.id) ?? 0;
            if (!rows.has(g)) rows.set(g, []);
            rows.get(g).push(map.get(n.id));
          });

          rows.forEach((row) => {
            row.sort((a, b) => a.x - b.x);
            for (let i = 1; i < row.length; i++) {
              if (row[i].x - row[i - 1].x < 120) {
                row[i].x = row[i - 1].x + 120;
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



      function tidyUpLayout() {
        const people = nodes.value
          .filter((n) => n.type === 'person')
          .map((n) => ({
            id: n.data.id,
            fatherId: n.data.fatherId,
            motherId: n.data.motherId,
            x: 0,
            y: 0,
          }));

        tidyUp(people);

        const posMap = {};
        people.forEach((p) => {
          posMap[p.id] = { x: p.x, y: p.y };
        });

        nodes.value.forEach((n) => {
          if (n.type === 'person' && posMap[n.data.id]) {
            n.position.x = posMap[n.data.id].x;
            n.position.y = posMap[n.data.id].y;
          }
        });

        refreshUnions();
      }

        async function saveNewPerson() {
          const payload = {
            firstName: selected.value.firstName,
            lastName: selected.value.lastName,
            maidenName: selected.value.maidenName || null,
            dateOfBirth: selected.value.dateOfBirth || null,
            dateOfDeath: selected.value.dateOfDeath || null,
            placeOfBirth: selected.value.placeOfBirth || null,
            notes: selected.value.notes || null,
            gender: selected.value.gender,
            fatherId: selected.value.fatherId || null,
            motherId: selected.value.motherId || null,
          };
          const p = await FrontendApp.createPerson(payload);
          if (selected.value.spouseId) {
            await FrontendApp.linkSpouse(p.id, parseInt(selected.value.spouseId));
          }
          if (selected.value.relation) {
            const rel = selected.value.relation;
            if (rel.type === 'father' || rel.type === 'mother') {
              const update = {};
              update[rel.type === 'father' ? 'fatherId' : 'motherId'] = p.id;
              await FrontendApp.updatePerson(rel.childId, update);
            }
          }
          await load(true);
          if (newNodePos) {
            const node = nodes.value.find((n) => n.id === String(p.id));
            if (node) {
              node.position = { ...newNodePos };
            }
            await saveLayout();
            refreshUnions();
            newNodePos = null;
          }
          showModal.value = false;
          isNew.value = false;
          selected.value = null;
        }

       function cancelModal() {
         showModal.value = false;
         if (isNew.value) {
           selected.value = null;
           isNew.value = false;
         }
         editing.value = false;
       }

       function openContextMenu(ev) {
         const point = ev.touches ? ev.touches[0] : ev;
         const rect = document
           .getElementById('flow-app')
           .getBoundingClientRect();
         contextX.value = point.clientX - rect.left;
         contextY.value = point.clientY - rect.top;
         contextMenuVisible.value = true;
       }

       function handleContextMenu(ev) {
         ev.preventDefault();
         openContextMenu(ev);
       }

       function handleTouchStart(ev) {
         longPressTimer = setTimeout(() => {
           openContextMenu(ev);
         }, 500);
       }

       function handleTouchEnd() {
         clearTimeout(longPressTimer);
       }

       function menuAdd() {
         const pos = screenToFlowCoordinate({
           x: contextX.value,
           y: contextY.value,
         });
         contextMenuVisible.value = false;
         addPerson(pos);
       }

       function menuTidy() {
         contextMenuVisible.value = false;
         tidyUpLayout();
       }

       function menuFit() {
         contextMenuVisible.value = false;
         fitView();
       }

        return {
          nodes,
          edges,
         onNodeClick,
         onPaneClick,
         onEdgeClick,
         onConnect,
          addPerson,
          deleteSelected,
          saveNewPerson,
          cancelModal,
          unlinkChild,
          addChild,
          addSpouse,
          addParent,
          selected,
          showModal,
          children,
         isNew,
         editing,
         avatarSrc,
         tidyUpLayout,
        saveLayout,
        loadLayout,
        fitView,
        downloadPng,
        downloadSvg,
        toggleSnap,
        snapToGrid,
        gridSize,
        onNodeDragStop,
        handleContextMenu,
        handleTouchStart,
        handleTouchEnd,
        contextMenuVisible,
        contextX,
        contextY,
        menuAdd,
        menuTidy,
        menuFit,
      };
      },
      template: `
        <div style="width: 100%; height: 100%" @click="contextMenuVisible = false">
          <div id="toolbar">
            <button class="icon-button" @click="addPerson" title="Add Person">
              <svg viewBox="0 0 24 24"><path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/></svg>
            </button>
            <button class="icon-button" @click="tidyUpLayout" title="Tidy Up">
              <svg viewBox="0 0 24 24">
                <path d="M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z" />
              </svg>
            </button>
            <button class="icon-button" @click="saveLayout" title="Save Layout">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="loadLayout" title="Reload Layout">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="fitView" title="Fit to Screen">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M15 3.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V5.56l-3.97 3.97a.75.75 0 1 1-1.06-1.06l3.97-3.97h-2.69a.75.75 0 0 1-.75-.75Zm-12 0A.75.75 0 0 1 3.75 3h4.5a.75.75 0 0 1 0 1.5H5.56l3.97 3.97a.75.75 0 0 1-1.06 1.06L4.5 5.56v2.69a.75.75 0 0 1-1.5 0v-4.5Zm11.47 11.78a.75.75 0 1 1 1.06-1.06l3.97 3.97v-2.69a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h2.69l-3.97-3.97Zm-4.94-1.06a.75.75 0 0 1 0 1.06L5.56 19.5h2.69a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 1.5 0v2.69l3.97-3.97a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="downloadPng" title="Download PNG">
              <svg viewBox="0 0 24 24">
                <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z"/>
                <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Zm12-1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="icon-button" @click="downloadSvg" title="Download SVG">
              <svg viewBox="0 0 24 24">
                <path d="M11.25 3h1.5v10.379l3.47-3.47 1.06 1.06-5 5a.75.75 0 0 1-1.06 0l-5-5 1.06-1.06 3.47 3.47V3z"/>
                <path d="M4.5 18.75h15v1.5h-15z"/>
              </svg>
            </button>
            <button class="icon-button" @click="toggleSnap" :class="{ active: snapToGrid }" :title="snapToGrid ? 'Disable Snap to Grid' : 'Enable Snap to Grid'">
              <svg viewBox="0 0 24 24">
                <path d="M3 3h18v18H3V3m2 2v14h14V5H5Z" />
              </svg>
            </button>
          </div>
          <VueFlow
            style="width: 100%; height: 100%"
            v-model:nodes="nodes"
            v-model:edges="edges"
            @node-click="onNodeClick"
            @pane-click="onPaneClick"
            @connect="onConnect"
            @node-drag-stop="onNodeDragStop"
            @edge-click="onEdgeClick"
            @contextmenu.prevent="handleContextMenu"
            @touchstart="handleTouchStart"
            @touchend="handleTouchEnd"
            @touchcancel="handleTouchEnd"
            :fit-view-on-init="true"
            :min-zoom="0.1"
            :select-nodes-on-drag="true"
            :snap-to-grid="snapToGrid"
            :snap-grid="[gridSize, gridSize]"
            selection-key-code="Shift"
            multi-selection-key-code="Shift"
          >
            <template #node-person="{ data }">
              <div class="person-node" :class="{ 'highlight-node': data.highlight, 'faded-node': selected && !data.highlight }" :style="{ borderColor: data.gender === 'female' ? '#f8c' : (data.gender === 'male' ? '#88f' : '#ccc') }">
                <div class="header">
                  <img :src="avatarSrc(data.gender, 40)" class="avatar" />
                  <div class="name-container">
                    <span :style="{ fontSize: data.firstName && data.firstName.length > 12 ? '0.7rem' : '0.8rem', fontWeight: 'bold' }">{{ data.firstName }}</span>
                    <span :style="{ fontSize: data.lastName && data.lastName.length > 12 ? '0.7rem' : '0.8rem', fontWeight: 'bold' }">{{ data.lastName }}</span>
                  </div>
                </div>
                <div class="small">{{ data.dateOfBirth }}<span v-if="data.dateOfBirth || data.dateOfDeath"> - </span>{{ data.dateOfDeath }}</div>
                <Handle type="source" position="top" id="s-top" />
                <Handle type="source" position="right" id="s-right" />
                <Handle type="source" position="bottom" id="s-bottom" />
                <Handle type="source" position="left" id="s-left" />
                <Handle type="target" position="top" id="t-top" />
                <Handle type="target" position="right" id="t-right" />
                <Handle type="target" position="bottom" id="t-bottom" />
                <Handle type="target" position="left" id="t-left" />
              </div>
            </template>
            <template #node-helper="{ data }">
              <div class="helper-node" :class="{ 'highlight-node': data.highlight, 'faded-node': selected && !data.highlight }">
                <Handle type="source" position="bottom" id="s-bottom" />
              </div>
            </template>
          </VueFlow>

          <ul
            v-if="contextMenuVisible"
            class="context-menu"
            :style="{ left: contextX + 'px', top: contextY + 'px' }"
          >
            <li @click="menuAdd">Add New</li>
            <li @click="menuTidy">Tidy Up</li>
            <li @click="menuFit">Zoom to Fit</li>
          </ul>

          <div v-if="showModal" class="modal">
            <div
              class="modal-content card shadow border-0"
              :style="{
                maxWidth: '500px',
                borderColor: selected.gender === 'female' ? '#f8c' : (selected.gender === 'male' ? '#88f' : '#ccc'),
                borderWidth: '2px',
                borderStyle: 'solid',
              }"
            >
              <div class="card-body p-3" style="max-height: 80vh; overflow-y: auto;">
                <template v-if="!editing && !isNew">
                  <div class="d-flex align-items-center mb-3">
                    <img :src="avatarSrc(selected.gender, 80)" class="avatar-placeholder mr-3" />
                    <div class="name-container">
                      <div class="h4 mb-0" :style="{ fontSize: selected.firstName && selected.firstName.length > 15 ? '1rem' : '1.25rem' }">{{ selected.firstName }}</div>
                      <div class="h4 mb-0" :style="{ fontSize: selected.lastName && selected.lastName.length > 15 ? '1rem' : '1.25rem' }">{{ selected.lastName }}</div>
                    </div>
                  </div>
                  <p v-if="selected.maidenName"><strong>Maiden Name:</strong> {{ selected.maidenName }}</p>
                  <p v-if="selected.dateOfBirth || selected.dateOfDeath">
                    <strong>Life:</strong>
                    <span v-if="selected.dateOfBirth">{{ selected.dateOfBirth }}</span>
                    <span v-if="selected.dateOfBirth || selected.dateOfDeath"> - </span>
                    <span v-if="selected.dateOfDeath">{{ selected.dateOfDeath }}</span>
                  </p>
                  <p v-if="selected.placeOfBirth"><strong>Place of Birth:</strong> {{ selected.placeOfBirth }}</p>
                  <p v-if="selected.notes"><strong>Notes:</strong> {{ selected.notes }}</p>
                  <div v-if="children.length" class="mb-2">
                    <strong>Children:</strong>
                    <ul>
                      <li v-for="c in children" :key="c.id">{{ c.firstName }} {{ c.lastName }}</li>
                    </ul>
                  </div>
                  <div class="text-right mt-3">
                    <button class="btn btn-primary btn-sm mr-2" @click="editing = true">Edit</button>
                    <button class="btn btn-secondary btn-sm" @click="cancelModal">Close</button>
                  </div>
                </template>
                <template v-else>
                  <h3 class="card-title" v-if="isNew">Add Person</h3>
                  <h3 class="card-title" v-else>Edit Person</h3>
                  <div class="form-row">
                    <div class="col d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">First Name</label>
                      <input class="form-control flex-fill" v-model="selected.firstName" placeholder="Enter first name" title="Given name" />
                    </div>
                    <div class="col d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Last Name</label>
                      <input class="form-control flex-fill" v-model="selected.lastName" placeholder="Enter last name" title="Family name" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Gender</label>
                      <select class="form-control flex-fill" v-model="selected.gender" title="Gender">
                        <option value="">Please select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Date of Birth</label>
                      <input class="form-control flex-fill" v-model="selected.dateOfBirth" type="date" title="Birth date" />
                    </div>
                    <div class="col d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Place of Birth</label>
                      <input class="form-control flex-fill" v-model="selected.placeOfBirth" placeholder="City or town" title="Place of birth" />
                    </div>
                  </div>
                  <button class="btn btn-link p-0 mb-2" type="button" data-toggle="collapse" data-target="#modalDetails">More Details</button>
                  <div id="modalDetails" class="collapse">
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Maiden Name</label>
                      <input class="form-control flex-fill" v-model="selected.maidenName" placeholder="Birth surname" title="Maiden name" />
                    </div>
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Date of Death</label>
                      <input class="form-control flex-fill" v-model="selected.dateOfDeath" type="date" title="Death date" />
                    </div>
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Father</label>
                      <select class="form-control flex-fill" v-model="selected.fatherId" title="Select father">
                        <option value="">Father</option>
                        <option v-for="n in nodes" :key="'f'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                      </select>
                    </div>
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Mother</label>
                      <select class="form-control flex-fill" v-model="selected.motherId" title="Select mother">
                        <option value="">Mother</option>
                        <option v-for="n in nodes" :key="'m'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                      </select>
                    </div>
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Spouse</label>
                      <select class="form-control flex-fill" v-model="selected.spouseId" title="Link spouse">
                        <option value="">Spouse</option>
                        <option v-for="n in nodes" :key="'s'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                      </select>
                    </div>
                    <div class="d-flex align-items-center mb-2">
                      <label class="mr-2 mb-0" style="width: 90px;">Notes</label>
                      <textarea class="form-control flex-fill" v-model="selected.notes" placeholder="Additional info" title="Notes"></textarea>
                    </div>
                  </div>
                  <div v-if="children.length" class="mb-2">
                    <label>Children</label>
                    <ul>
                      <li v-for="c in children" :key="c.id">
                        {{ c.firstName }} {{ c.lastName }}
                        <button class="btn btn-sm btn-danger ml-1" @click="unlinkChild(c)">x</button>
                      </li>
                    </ul>
                  </div>
                  <div class="text-right mt-3">
                    <button v-if="!isNew" @click="deleteSelected" class="btn btn-danger btn-sm mr-2">Delete</button>
                    <button v-if="isNew" class="btn btn-primary mr-2" @click="saveNewPerson">Save</button>
                    <button class="btn btn-secondary" @click="cancelModal">{{ isNew ? 'Cancel' : 'Close' }}</button>
                  </div>
                </template>

              </div>
            </div>
          </div>
        </div>
      `,
    });

    return app.mount('#flow-app');
  }

  return { mount };
});
