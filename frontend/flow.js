(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowApp = factory();
  }
})(this, function () {
  /* global html2canvas, d3, GenerationLayout, AppConfig, I18n */
  const GedcomUtil = typeof require === 'function'
    ? (() => { try { return require('./src/utils/gedcom'); } catch (e) { return {}; } })()
    : (typeof window !== 'undefined' ? (window.Gedcom || {}) : {});
  const DedupeUtil = typeof require === 'function'
    ? (() => { try { return require('./src/utils/dedup'); } catch (e) { return {}; } })()
    : (typeof window !== 'undefined' ? (window.Dedupe || {}) : {});
  const parseGedcom = GedcomUtil.parseGedcom || function () { return []; };
  const findBestMatch = DedupeUtil.findBestMatch || function () { return { match: null, score: 0 }; };
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  let appState = null;

  function focusNode(pid) {
    if (!appState) return;
    const { nodes, fitView, nextTick } = appState;
    nextTick(() => {
      const node = nodes.value.find((n) => n.id === String(pid));
      if (!node) return;
      fitView({ nodes: [String(pid)], maxZoom: 1.5, padding: 0.1 });
      node.data.highlight = true;
      setTimeout(() => {
        node.data.highlight = false;
      }, 800);
    });
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
        const I18nGlobal = typeof I18n !== 'undefined' ? I18n : { t: (k) => k };
        const { fitView } = useZoomPanHelper();
        const {
          screenToFlowCoordinate,
          project,
          dimensions,
          addSelectedNodes,
          removeSelectedNodes,
          getSelectedNodes,
          snapToGrid,
          snapGrid,
          viewport,
        } = useVueFlow();
        const horizontalGridSize =
          (window.AppConfig &&
            (AppConfig.horizontalGridSize || AppConfig.gridSize)) ||
          30;
        const verticalGridSize =
          (window.AppConfig &&
            (AppConfig.verticalGridSize || AppConfig.gridSize)) ||
          30;
        const baseGridSize =
          (horizontalGridSize + verticalGridSize) / 2;

        function updateGridSize(zoom) {
          const el = document.getElementById('flow-app');
          if (!el) return;
          const size = Math.max(8, baseGridSize / zoom);
          el.style.backgroundSize = `${size}px ${size}px`;
        }
        const relativeAttraction =
          (window.AppConfig &&
            (typeof AppConfig.relativeAttraction !== 'undefined'
              ? parseFloat(AppConfig.relativeAttraction)
              : null)) || 0.5;
        const showDeleteAllButton =
          !!(window.AppConfig && AppConfig.showDeleteAllButton);
        const selected = ref(null);
        const showModal = ref(false);
        const contextMenuVisible = ref(false);
        const contextX = ref(0);
        const contextY = ref(0);
        const showImport = ref(false);
        const gedcomText = ref('');
        const conflicts = ref([]);
        const conflictIndex = ref(0);
        const showConflict = ref(false);
        const useBirthApprox = ref(false);
        const useDeathApprox = ref(false);
        const birthExactBackup = ref('');
        const deathExactBackup = ref('');
        let originalSelected = null;
        const showFilter = ref(false);
        const showRelatives = ref(false);
        const relativesNodes = ref([]);
        const relativesEdges = ref([]);
        const relativesMode = ref('both');
        let relativesRoot = null;
        const placeSuggestions = ref([]);
        const placeDisplayCount = ref(5);
        function visiblePlaceSuggestions() {
          return placeSuggestions.value.slice(0, placeDisplayCount.value);
        }
        const placeFocus = ref(false);
        const filters = ref({
          missingParents: false,
          missingBirth: false,
          missingDeath: false,
          missingMaiden: false,
        });
        const filterActive = ref(false);
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

        function spouseHandles(n1, n2) {
          if (!n1 || !n2) {
            return { source: 's-right', target: 't-left' };
          }
          return n1.position.x <= n2.position.x
            ? { source: 's-right', target: 't-left' }
            : { source: 's-left', target: 't-right' };
        }

        const TEMP_KEY = 'tempLayout';

        function saveTempLayout() {
          const payload = {
            nodes: nodes.value.map((n) => ({
              id: n.id,
              x: n.position.x,
              y: n.position.y,
            })),
          };
          try {
            localStorage.setItem(TEMP_KEY, JSON.stringify(payload));
          } catch (e) {
            /* ignore */
          }
        }

        function loadTempLayout() {
          try {
            const str = localStorage.getItem(TEMP_KEY);
            return str ? JSON.parse(str) : null;
          } catch (e) {
            return null;
          }
        }

        async function applySavedLayout() {
          const res = await fetch('/api/layout');
          let layout = null;
          if (res.ok) layout = await res.json();
          const map = {};
          if (layout && Array.isArray(layout.nodes)) {
            layout.nodes.forEach((n) => {
              map[n.id] = n;
            });
          }
          const temp = loadTempLayout();
          if (temp && Array.isArray(temp.nodes)) {
            temp.nodes.forEach((n) => {
              map[n.id] = n;
            });
          }
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
            const fatherNode = nodes.value.find(
              (n) => n.id === String(m.fatherId)
            );
            const motherNode = nodes.value.find(
              (n) => n.id === String(m.motherId)
            );
            const handles = spouseHandles(fatherNode, motherNode);
            edges.value.push({
              id: `spouse-line-${m.id}`,
              source: String(m.fatherId),
              target: String(m.motherId),
              type: 'straight',
              sourceHandle: handles.source,
              targetHandle: handles.target,
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
          saveTempLayout();
          applyFilters();
        }

        const children = ref([]);

        function computeChildren(pid) {
          children.value = nodes.value
            .filter((n) => n.data.fatherId === pid || n.data.motherId === pid)
            .map((n) => n.data);
        }

        function personName(pid) {
          const pNode = nodes.value.find((n) => n.id === String(pid));
          if (!pNode) return '';
          const p = pNode.data;
          return (p.callName ? p.callName + ' (' + p.firstName + ')' : p.firstName) + ' ' + p.lastName;
        }

        async function gotoPerson(pid) {
          if (!pid) return;
          showModal.value = false;
          editing.value = false;
          await nextTick();
          const node = nodes.value.find((n) => n.id === String(pid));
          if (!node) return;
          highlightBloodline(pid);
          fitView({ nodes: [String(pid)], maxZoom: 1.5, padding: 0.1 });
          selected.value = { ...node.data, spouseId: '' };
          useBirthApprox.value = !!selected.value.birthApprox;
          useDeathApprox.value = !!selected.value.deathApprox;
          birthExactBackup.value = selected.value.dateOfBirth || '';
          deathExactBackup.value = selected.value.dateOfDeath || '';
          computeChildren(pid);
          showModal.value = true;
        }

        function handleKeydown(ev) {
          if (ev.key === 'Shift') {
            shiftPressed.value = true;
          }
          if (ev.key === 'Enter' && editing.value && showModal.value) {
            ev.preventDefault();
            if (isNew.value) {
              saveNewPerson();
            } else {
              saveSelected();
            }
            cancelModal();
            return;
          }
        if (ev.shiftKey && ev.altKey && ev.key.toLowerCase() === 't') {
          ev.preventDefault();
          tidyUpLayout();
          return;
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key.toLowerCase() === 'a') {
          ev.preventDefault();
          addSelectedNodes(nodes.value);
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
          snapGrid.value = [horizontalGridSize, verticalGridSize];
          snapToGrid.value = true;
          updateGridSize(viewport.value.zoom || 1);
          watch(
            viewport,
            (v) => {
              updateGridSize(v.zoom);
            },
            { deep: true }
          );
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

        function computeRelatives() {
          if (!relativesRoot) return;
          const mode = relativesMode.value;
          const map = {};
          nodes.value.forEach((n) => {
            map[n.id] = n;
          });
          const allowed = new Set();
          const visitedUp = new Set();
          const visitedDown = new Set();

          function unionId(f, m) {
            return `u-${f}-${m}`;
          }

          function addNode(id) {
            if (id) allowed.add(String(id));
          }

          function walkAncestors(pid) {
            if (!pid || visitedUp.has(pid)) return;
            visitedUp.add(pid);
            const node = map[String(pid)];
            if (!node) return;
            addNode(pid);
            if (node.data.fatherId && node.data.motherId) {
              addNode(unionId(node.data.fatherId, node.data.motherId));
            }
            walkAncestors(node.data.fatherId);
            walkAncestors(node.data.motherId);
          }

          function walkDescendants(pid) {
            if (!pid || visitedDown.has(pid)) return;
            visitedDown.add(pid);
            const node = map[String(pid)];
            if (!node) return;
            addNode(pid);
            nodes.value.forEach((child) => {
              if (
                child.data.fatherId === pid ||
                child.data.motherId === pid
              ) {
                if (child.data.fatherId && child.data.motherId) {
                  addNode(unionId(child.data.fatherId, child.data.motherId));
                }
                walkDescendants(parseInt(child.id));
              }
            });
          }

          if (mode === 'ancestors' || mode === 'both') walkAncestors(relativesRoot);
          if (mode === 'descendants' || mode === 'both') walkDescendants(relativesRoot);

          const newNodes = nodes.value
            .filter((n) => allowed.has(n.id))
            .map((n) => ({
              id: n.id,
              type: n.type,
              position: { ...n.position },
              data: { ...n.data },
              dimensions: n.dimensions ? { ...n.dimensions } : undefined,
            }));

          const newEdges = edges.value
            .filter((e) => allowed.has(e.source) && allowed.has(e.target))
            .map((e) => ({ ...e }));

          tidySubtree(newNodes);
          relativesNodes.value = newNodes;
          relativesEdges.value = newEdges;
        }

        function tidySubtree(list) {
          const people = list
            .filter((n) => n.type === 'person')
            .map((n) => ({
              id: n.data.id,
              fatherId: n.data.fatherId,
              motherId: n.data.motherId,
              spouseIds: [],
              width: n.dimensions?.width || 0,
              x: 0,
              y: 0,
            }));
          const pMap = new Map(people.map((p) => [p.id, p]));
          list.forEach((n) => {
            if (n.id.startsWith('u-')) {
              const parts = n.id.split('-');
              const a = pMap.get(parseInt(parts[1]));
              const b = pMap.get(parseInt(parts[2]));
              if (a && b) {
                if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
                if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);
              }
            }
          });
          tidyUp(people);
          const posMap = {};
          people.forEach((p) => {
            posMap[p.id] = { x: p.x, y: p.y };
          });
          list.forEach((n) => {
            if (n.type === 'person' && posMap[n.data.id]) {
              n.position.x = posMap[n.data.id].x;
              n.position.y = posMap[n.data.id].y;
            }
          });
          list.forEach((n) => {
            if (n.id.startsWith('u-')) {
              const parts = n.id.split('-');
              const father = list.find((p) => p.id === parts[1]);
              const mother = list.find((p) => p.id === parts[2]);
              if (father && mother) {
                const fatherWidth = father.dimensions?.width || 0;
                const motherWidth = mother.dimensions?.width || 0;
                const fatherHeight = father.dimensions?.height || 0;
                const motherHeight = mother.dimensions?.height || 0;
                n.position = {
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
              }
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
            useBirthApprox.value = !!selected.value.birthApprox;
            useDeathApprox.value = !!selected.value.deathApprox;
            birthExactBackup.value = selected.value.dateOfBirth || '';
            deathExactBackup.value = selected.value.dateOfDeath || '';
            computeChildren(evt.node.data.id);
            editing.value = false;
            showModal.value = true;
          } else {
            selected.value = { ...evt.node.data, spouseId: '' };
            useBirthApprox.value = !!selected.value.birthApprox;
            useDeathApprox.value = !!selected.value.deathApprox;
            birthExactBackup.value = selected.value.dateOfBirth || '';
            deathExactBackup.value = selected.value.dateOfDeath || '';
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
            ['maidenName', 'dateOfBirth', 'birthApprox', 'dateOfDeath', 'deathApprox', 'placeOfBirth', 'notes', 'fatherId', 'motherId'].forEach((f) => {
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

        watch(useBirthApprox, (val) => {
          if (!selected.value) return;
          if (val) {
            birthExactBackup.value = selected.value.dateOfBirth;
            selected.value.dateOfBirth = '';
          } else if (!selected.value.birthApprox) {
            selected.value.dateOfBirth = birthExactBackup.value;
          }
        });

        watch(useDeathApprox, (val) => {
          if (!selected.value) return;
          if (val) {
            deathExactBackup.value = selected.value.dateOfDeath;
            selected.value.dateOfDeath = '';
          } else if (!selected.value.deathApprox) {
            selected.value.dateOfDeath = deathExactBackup.value;
          }
        });

        let placeController = null;
        const fetchPlaces = debounce(async (val) => {
          if (placeController) placeController.abort();
          if (!val) { placeSuggestions.value = []; placeDisplayCount.value = 5; return; }
          placeController = new AbortController();
          const lang = I18nGlobal.getLang ? I18nGlobal.getLang().toLowerCase() : 'en';
          try {
            const res = await fetch(
              `/places/suggest?q=${encodeURIComponent(val)}&lang=${lang}`,
              { signal: placeController.signal },
            );
            placeSuggestions.value = res.ok ? await res.json() : [];
            placeDisplayCount.value = 5;
          } catch (e) {
            if (e.name !== 'AbortError') placeSuggestions.value = [];
          }
        }, 250);

        function onPlaceInput(e) {
          fetchPlaces(e.target.value);
        }

        function hidePlaceDropdown() {
          setTimeout(() => { placeFocus.value = false; }, 150);
        }

        function applyPlace(s) {
          if (!selected.value) return;
          selected.value.placeOfBirth = s.name;
          selected.value.geonameId = s.geonameId;
          placeFocus.value = false;
        }

        function useTypedPlace() {
          if (selected.value) {
            selected.value.placeOfBirth = (selected.value.placeOfBirth || '').trim();
          }
          placeFocus.value = false;
        }

        function onPlaceScroll(e) {
          if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 5) {
            if (placeDisplayCount.value < placeSuggestions.value.length) {
              placeDisplayCount.value += 5;
            }
          }
        }

        watch(editing, (val, oldVal) => {
          if (val && !oldVal && selected.value && !isNew.value) {
            originalSelected = JSON.parse(JSON.stringify(selected.value));
            birthExactBackup.value = selected.value.dateOfBirth || '';
            deathExactBackup.value = selected.value.dateOfDeath || '';
          }
        });

        watch(shiftPressed, (val) => {
          document.body.classList.toggle('multi-select-active', val);
          const ind = document.getElementById('multiIndicator');
          if (ind) ind.style.display = val ? 'block' : 'none';
        });

        function refreshI18n() {
          if (I18n && typeof I18n.updateDom === 'function') {
            nextTick(() => I18n.updateDom());
          }
        }

        watch(showModal, refreshI18n);
        watch(editing, refreshI18n);
        watch(showImport, (v) => v && refreshI18n());
        watch(showFilter, (v) => v && refreshI18n());
        watch(showConflict, (v) => v && refreshI18n());
        watch(showRelatives, (v) => v && refreshI18n());

        function applyFilters() {
          const f = filters.value;
          filterActive.value =
            f.missingParents || f.missingBirth || f.missingDeath || f.missingMaiden;
          nodes.value.forEach((n) => {
            if (!n.data || n.data.helper) return;
            if (!filterActive.value) {
              n.data.highlight = false;
              return;
            }
            let h = false;
            if (f.missingParents && (!n.data.fatherId || !n.data.motherId)) h = true;
            if (f.missingBirth && !(n.data.dateOfBirth || n.data.birthApprox)) h = true;
            if (f.missingDeath && !(n.data.dateOfDeath || n.data.deathApprox)) h = true;
            if (
              f.missingMaiden &&
              n.data.gender === 'female' &&
              !n.data.maidenName
            )
              h = true;
            n.data.highlight = h;
          });
        }

        function resetFilters() {
          filters.value = {
            missingParents: false,
            missingBirth: false,
            missingDeath: false,
            missingMaiden: false,
          };
          applyFilters();
        }

        watch(
          filters,
          () => {
            applyFilters();
          },
          { deep: true }
        );

        watch(relativesMode, () => {
          computeRelatives();
        });

        function onNodeDragStop() {
          refreshUnions();
          saveTempLayout();
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
          try { localStorage.removeItem(TEMP_KEY); } catch (e) { /* ignore */ }
        }

        async function loadLayout() {
          await applySavedLayout();
          refreshUnions();
          try { localStorage.removeItem(TEMP_KEY); } catch (e) { /* ignore */ }
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
          if (I18n && typeof I18n.updateDom === 'function') {
            I18n.updateDom();
          }
        }

        function openImport() {
          gedcomText.value = '';
          showImport.value = true;
        }

        function openFilter() {
          showFilter.value = true;
        }

        function openRelatives() {
          const list = getSelectedNodes.value;
          if (list.length !== 1) return;
          relativesRoot = parseInt(list[0].id);
          relativesMode.value = 'both';
          computeRelatives();
          showRelatives.value = true;
        }

        function triggerSearch() {
          if (window.SearchApp && typeof window.SearchApp.show === 'function') {
            window.SearchApp.show();
          }
        }

        async function handleNodesChange(changes) {
          const removed = (changes || []).filter((c) => c.type === 'remove');
          for (const r of removed) {
            if (!/^\d+$/.test(r.id)) continue;
            try {
              await FrontendApp.deletePerson(parseInt(r.id, 10));
            } catch (e) {
              console.error('Failed to delete person', r.id, e);
            }
          }
        }

        async function deleteAll() {
          const ok = window.confirm('Delete all nodes and edges?');
          if (!ok) return;
          await FrontendApp.clearDatabase();
          nodes.value = [];
          edges.value = [];
          try { localStorage.removeItem(TEMP_KEY); } catch (e) { /* ignore */ }
        }

        async function processImport() {
          const { people: importPeople = [], families = [] } =
            parseGedcom(gedcomText.value || '');
          const existing = await FrontendApp.fetchPeople();
          const conflictList = [];
          const idMap = {};
          const THRESHOLD = 4;
          for (const p of importPeople) {
            const { match: dup, score } = findBestMatch(p, existing);
            if (dup && score >= THRESHOLD) {
              idMap[p.gedcomId] = dup.id;
              conflictList.push({ existing: dup, incoming: p });
            } else {
              const created = await FrontendApp.createPerson(p);
              idMap[p.gedcomId] = created.id;
              existing.push(created);
            }
          }
          for (const f of families) {
            const hus = idMap[f.husband];
            const wife = idMap[f.wife];
            if (hus && wife) {
              await FrontendApp.linkSpouse(hus, wife, {
                dateOfMarriage: f.date,
                marriageApprox: f.approx,
                placeOfMarriage: f.place,
              });
            }
            for (const cId of f.children) {
              const cid = idMap[cId];
              if (!cid) continue;
              const updates = {};
              if (hus) updates.fatherId = hus;
              if (wife) updates.motherId = wife;
              if (Object.keys(updates).length) {
                await FrontendApp.updatePerson(cid, updates);
              }
            }
          }
          conflicts.value = conflictList;
          conflictIndex.value = 0;
          showImport.value = false;
          if (conflicts.value.length) showConflict.value = true;
          else await load(true);
        }

        async function resolveConflict(action) {
          const c = conflicts.value[conflictIndex.value];
          if (!c) return;
          if (action === 'keepBoth') {
            await FrontendApp.createPerson(c.incoming);
          } else if (action === 'keepExisting') {
            // do nothing, keep existing as is
          } else if (action === 'overwrite') {
            await FrontendApp.updatePerson(c.existing.id, c.incoming);
          } else if (action === 'merge') {
            const updates = {};
            Object.keys(c.incoming).forEach((k) => {
              if (!c.existing[k]) updates[k] = c.incoming[k];
            });
            if (Object.keys(updates).length)
              await FrontendApp.updatePerson(c.existing.id, {
                ...c.existing,
                ...updates,
              });
          }
          conflictIndex.value += 1;
          if (conflictIndex.value >= conflicts.value.length) {
            showConflict.value = false;
            await load(true);
          }
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
            callName: '',
            firstName: '',
            lastName: '',
           maidenName: '',
           dateOfBirth: '',
            birthApprox: '',
           dateOfDeath: '',
            deathApprox: '',
           placeOfBirth: '',
            notes: '',
            gender: 'female',
            fatherId: '',
            motherId: '',
            spouseId: '',
          };
          useBirthApprox.value = false;
          useDeathApprox.value = false;
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
            callName: '',
            firstName: '',
            lastName: '',
           maidenName: '',
           dateOfBirth: '',
            birthApprox: '',
           dateOfDeath: '',
            deathApprox: '',
           placeOfBirth: '',
            notes: '',
            gender: 'female',
            fatherId: base.gender === 'female' ? '' : base.id,
            motherId: base.gender === 'female' ? base.id : '',
            spouseId: '',
          };
          useBirthApprox.value = false;
          useDeathApprox.value = false;
          isNew.value = true;
          editing.value = true;
        }

        function addSpouse() {
          const base = { ...selected.value };
          selected.value = {
            callName: '',
            firstName: '',
            lastName: '',
           maidenName: '',
           dateOfBirth: '',
            birthApprox: '',
           dateOfDeath: '',
            deathApprox: '',
           placeOfBirth: '',
            notes: '',
            gender: 'female',
            fatherId: '',
            motherId: '',
            spouseId: base.id,
          };
          isNew.value = true;
          editing.value = true;
          useBirthApprox.value = false;
          useDeathApprox.value = false;
        }

        function addParent(type) {
          const childId = selected.value.id;
          selected.value = {
            callName: '',
            firstName: '',
            lastName: '',
           maidenName: '',
           dateOfBirth: '',
            birthApprox: '',
           dateOfDeath: '',
            deathApprox: '',
           placeOfBirth: '',
            notes: '',
            gender: type === 'father' ? 'male' : 'female',
            fatherId: '',
            motherId: '',
            spouseId: '',
            relation: { type, childId },
          };
          isNew.value = true;
          editing.value = true;
          useBirthApprox.value = false;
          useDeathApprox.value = false;
        }

        function startAddParent(type) {
          showModal.value = false;
          addParent(type);
          nextTick(() => {
            showModal.value = true;
          });
        }

        async function deleteSelected() {
          if (!selected.value) return;
          const id = selected.value.id;
          showModal.value = false;
          await FrontendApp.deletePerson(id);
          selected.value = null;
          await load(true);
        }

        async function cancelEdit() {
          if (!originalSelected || !selected.value || isNew.value) {
            editing.value = false;
            return;
          }
          const payload = { ...originalSelected };
          const spouseId = payload.spouseId;
          delete payload.spouseId;
          ['maidenName', 'dateOfBirth', 'birthApprox', 'dateOfDeath', 'deathApprox', 'placeOfBirth', 'notes', 'fatherId', 'motherId'].forEach((f) => {
            if (payload[f] === '') payload[f] = null;
          });
          await FrontendApp.updatePerson(originalSelected.id, payload);
          if (spouseId) {
            await FrontendApp.linkSpouse(originalSelected.id, parseInt(spouseId));
          }
          await load(true);
          selected.value = { ...originalSelected };
          computeChildren(originalSelected.id);
          useBirthApprox.value = !!selected.value.birthApprox;
          useDeathApprox.value = !!selected.value.deathApprox;
          editing.value = false;
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
                const handles = spouseHandles(father, mother);
                spEdge.sourceHandle = handles.source;
                spEdge.targetHandle = handles.target;
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
                  const mid =
                    (father.x + father.width / 2 + mother.x + mother.width / 2) /
                    2;
                  father.x = mid - father.width / 2 - H_SPACING / 2;
                  mother.x = mid + H_SPACING / 2 - mother.width / 2;
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
            spouseIds: [],
            width: n.dimensions?.width || 0,
            x: 0,
            y: 0,
          }));

        const pMap = new Map(people.map((p) => [p.id, p]));
        Object.values(unions).forEach((u) => {
          const a = pMap.get(u.fatherId);
          const b = pMap.get(u.motherId);
          if (a && b) {
            if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
            if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);
          }
        });

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
        saveTempLayout();
      }

        async function saveNewPerson() {
          const payload = {
            callName: selected.value.callName || '',
            firstName: selected.value.firstName,
            lastName: selected.value.lastName,
            maidenName: selected.value.maidenName || null,
            dateOfBirth: selected.value.dateOfBirth || null,
            birthApprox: selected.value.birthApprox || null,
            dateOfDeath: selected.value.dateOfDeath || null,
            deathApprox: selected.value.deathApprox || null,
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

      function overlayClose() {
        if (isNew.value) {
          saveNewPerson();
        } else {
          if (editing.value) saveSelected();
          cancelModal();
        }
      }

      function toGedcomDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
      }

      function personToGedcom(p) {
        const gid = p.gedcomId || `@I${p.id}@`;
        const lines = [`0 ${gid} INDI`, `1 NAME ${p.firstName || ''} /${p.lastName || ''}/`];
        if (p.gender) {
          lines.push(`1 SEX ${p.gender.toLowerCase().startsWith('f') ? 'F' : 'M'}`);
        }
        if (p.dateOfBirth || p.birthApprox) {
          lines.push('1 BIRT');
          lines.push(`2 DATE ${p.dateOfBirth ? toGedcomDate(p.dateOfBirth) : p.birthApprox}`);
          if (p.placeOfBirth) lines.push(`2 PLAC ${p.placeOfBirth}`);
        }
        if (p.dateOfDeath || p.deathApprox) {
          lines.push('1 DEAT');
          lines.push(`2 DATE ${p.dateOfDeath ? toGedcomDate(p.dateOfDeath) : p.deathApprox}`);
        }
        return lines.join('\n');
      }

      async function copyGedcom() {
        if (!selected.value) return;
        const text = personToGedcom(selected.value);
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          console.error('Copy failed', e);
        }
      }

      function personGedcomId(p) {
        return p.gedcomId || `@I${p.id}@`;
      }

      async function copySelectedGedcom() {
        const list = getSelectedNodes.value;
        if (!list || list.length === 0) return;
        contextMenuVisible.value = false;
        const map = {};
        list.forEach((n) => {
          map[n.id] = n.data;
        });
        const parts = list.map((n) => personToGedcom(n.data));
        const famMap = {};
        list.forEach((n) => {
          const d = n.data;
          if (d.fatherId && d.motherId && map[d.fatherId] && map[d.motherId]) {
            const key = `${d.fatherId}-${d.motherId}`;
            famMap[key] = famMap[key] || {
              father: d.fatherId,
              mother: d.motherId,
              children: [],
            };
            famMap[key].children.push(d.id);
          }
        });
        let idx = 1;
        Object.values(famMap).forEach((fam) => {
          const lines = [
            `0 @F${idx}@ FAM`,
            `1 HUSB ${personGedcomId(map[fam.father])}`,
            `1 WIFE ${personGedcomId(map[fam.mother])}`,
          ];
          fam.children.forEach((c) => {
            lines.push(`1 CHIL ${personGedcomId(map[c])}`);
          });
          parts.push(lines.join('\n'));
          idx += 1;
        });
        const text = parts.join('\n');
        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          console.error('Copy failed', e);
        }
      }

      function openContextMenu(ev) {
        clearTimeout(longPressTimer);
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

      appState = { nodes, fitView, nextTick };

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
        startAddParent,
        selected,
        showModal,
        children,
        isNew,
        editing,
        cancelEdit,
        avatarSrc,
         tidyUpLayout,
        saveLayout,
        loadLayout,
        fitView,
        downloadPng,
        downloadSvg,
        toggleSnap,
        deleteAll,
        snapToGrid,
        horizontalGridSize,
        verticalGridSize,
        onNodeDragStop,
        handleContextMenu,
        handleTouchStart,
        handleTouchEnd,
        contextMenuVisible,
        contextX,
        contextY,
        useBirthApprox,
        useDeathApprox,
        showImport,
        gedcomText,
        processImport,
        openImport,
        showConflict,
        conflicts,
        conflictIndex,
        resolveConflict,
        menuAdd,
        menuTidy,
        menuFit,
        overlayClose,
        copyGedcom,
        copySelectedGedcom,
        getSelectedNodes,
        openFilter,
        openRelatives,
        resetFilters,
        showFilter,
        showRelatives,
        filters,
        filterActive,
        relativesNodes,
        relativesEdges,
        relativesMode,
        triggerSearch,
        handleNodesChange,
        gotoPerson,
        personName,
        placeSuggestions,
        visiblePlaceSuggestions,
        placeFocus,
        onPlaceInput,
        hidePlaceDropdown,
        applyPlace,
        useTypedPlace,
        onPlaceScroll,
        showDeleteAllButton,
        I18n: I18nGlobal,
      };
      },
      template: `
        <div style="width: 100%; height: 100%" @click="contextMenuVisible = false">
          <div id="toolbar">
          <button class="icon-button" @click="addPerson" title="Add Person" data-i18n-title="addPerson">
            <svg viewBox="0 0 24 24"><path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/></svg>
          </button>
          <button class="icon-button" @click="openImport" title="Import GEDCOM" data-i18n-title="importGedcom">
            <svg viewBox="0 0 24 24"><path d="M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z"/></svg>
          </button>
          <button class="icon-button" @click="tidyUpLayout" title="Tidy Up" data-i18n-title="tidyUp">
              <svg viewBox="0 0 24 24">
                <path d="M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z" />
              </svg>
            </button>
            <button class="icon-button" @click="saveLayout" title="Save Layout" data-i18n-title="saveLayout">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="loadLayout" title="Reload Layout" data-i18n-title="loadLayout">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="fitView" title="Fit to Screen" data-i18n-title="fitToScreen">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M15 3.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V5.56l-3.97 3.97a.75.75 0 1 1-1.06-1.06l3.97-3.97h-2.69a.75.75 0 0 1-.75-.75Zm-12 0A.75.75 0 0 1 3.75 3h4.5a.75.75 0 0 1 0 1.5H5.56l3.97 3.97a.75.75 0 0 1-1.06 1.06L4.5 5.56v2.69a.75.75 0 0 1-1.5 0v-4.5Zm11.47 11.78a.75.75 0 1 1 1.06-1.06l3.97 3.97v-2.69a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h2.69l-3.97-3.97Zm-4.94-1.06a.75.75 0 0 1 0 1.06L5.56 19.5h2.69a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 1.5 0v2.69l3.97-3.97a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/></svg>
            </button>
            <button class="icon-button" @click="downloadPng" title="Download PNG" data-i18n-title="downloadPng">
              <svg viewBox="0 0 24 24">
                <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z"/>
                <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Zm12-1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="icon-button" @click="downloadSvg" title="Download SVG" data-i18n-title="downloadSvg">
              <svg viewBox="0 0 24 24">
                <path d="M11.25 3h1.5v10.379l3.47-3.47 1.06 1.06-5 5a.75.75 0 0 1-1.06 0l-5-5 1.06-1.06 3.47 3.47V3z"/>
                <path d="M4.5 18.75h15v1.5h-15z"/>
              </svg>
            </button>
            <button class="icon-button" @click="openFilter" title="Filter Nodes" data-i18n-title="filterNodes">
              <svg viewBox="0 0 24 24">
                <path d="M3 4h18L13 14v6l-2 2v-8L3 4z"/>
              </svg>
            </button>
            <button class="icon-button" @click="resetFilters" title="Reset Filters" :disabled="!filterActive" data-i18n-title="resetFilters">
              <svg viewBox="0 0 24 24" class="text-success">
                <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
            </button>
            <button
              class="icon-button"
              @click="toggleSnap"
              :class="{ active: snapToGrid }"
              :title="snapToGrid ? I18n.t('disableSnap') : I18n.t('enableSnap')"
              :data-i18n-title="snapToGrid ? 'disableSnap' : 'enableSnap'"
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 3h18v18H3V3m2 2v14h14V5H5Z" />
              </svg>
            </button>
            <button v-if="showDeleteAllButton" class="icon-button" @click="deleteAll" title="Delete All" style="border-color:#dc3545;color:#dc3545;" data-i18n-title="deleteAll">
              <svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-width="2" fill="none"/></svg>
            </button>
          </div>
          <button id="searchTrigger" class="icon-button" style="position:absolute;top:10px;right:10px;z-index:30;" @click="triggerSearch" data-i18n-title="search" title="Search">
            <svg viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM10.5 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>
            </svg>
          </button>
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
            @nodes-change="handleNodesChange"
            :fit-view-on-init="true"
            :min-zoom="0.1"
            :max-zoom="2"
            :zoom-on-scroll="true"
            :pan-on-scroll="true"
            :pan-on-scroll-speed="1"
            :zoom-on-pinch="true"
            :select-nodes-on-drag="true"
            :snap-to-grid="snapToGrid"
            :snap-grid="[horizontalGridSize, verticalGridSize]"
            selection-key-code="Shift"
          >
            <template #node-person="{ data }">
              <div class="person-node" :class="{ 'highlight-node': data.highlight, 'faded-node': (selected || filterActive) && !data.highlight }" :style="{ borderColor: data.gender === 'female' ? '#f8c' : (data.gender === 'male' ? '#88f' : '#ccc') }">
                <div class="header">
                  <img :src="avatarSrc(data.gender, 40)" class="avatar" data-i18n-alt="avatar" />
                  <div class="name-container">
                    <span :style="{ fontSize: (data.callName || data.firstName) && (data.callName || data.firstName).length > 12 ? '0.7rem' : '0.8rem', fontWeight: 'bold' }">{{ data.callName || data.firstName }}</span>
                    <span v-if="data.callName" :style="{ fontSize: data.firstName && data.firstName.length > 12 ? '0.7rem' : '0.8rem' }"> ({{ data.firstName }})</span>
                    <span :style="{ fontSize: data.lastName && data.lastName.length > 12 ? '0.7rem' : '0.8rem', fontWeight: 'bold' }"> {{ data.lastName }}</span>
                  </div>
                </div>
                <div class="small">
                  {{ data.dateOfBirth || data.birthApprox }}<span
                    v-if="(data.dateOfBirth || data.birthApprox) || (data.dateOfDeath || data.deathApprox)"
                    > - </span
                  >{{ data.dateOfDeath || data.deathApprox }}
                </div>
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
              <div class="helper-node" :class="{ 'highlight-node': data.highlight, 'faded-node': (selected || filterActive) && !data.highlight }">
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
            <li
              v-if="getSelectedNodes && getSelectedNodes.value && getSelectedNodes.value.length > 0"
              @click="openRelatives"
              data-i18n="showRelatives"
            >Show Relatives</li>
            <li
              v-if="getSelectedNodes && getSelectedNodes.value && getSelectedNodes.value.length > 0"
              @click="copySelectedGedcom"
            >Copy GEDCOM</li>
          </ul>

          <div v-if="showImport" class="modal">
            <div class="modal-content card p-3">
              <h4 data-i18n="importGedcom">Import GEDCOM</h4>
              <textarea class="form-control mb-2" rows="10" v-model="gedcomText" placeholder="Paste GEDCOM text" data-i18n-placeholder="pasteGedcom"></textarea>
              <div class="text-right">
                <button class="btn btn-primary btn-sm mr-2" @click="processImport" data-i18n="import">Import</button>
                <button class="btn btn-secondary btn-sm" @click="showImport = false" data-i18n="cancel">Cancel</button>
              </div>
          </div>
        </div>

        <div v-if="showFilter" class="modal">
          <div class="modal-content card p-3">
            <h4 data-i18n="filterNodes">Filter Nodes</h4>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="f1" v-model="filters.missingParents">
              <label class="form-check-label" for="f1" data-i18n="missingParents">Missing father or mother</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="f2" v-model="filters.missingBirth">
              <label class="form-check-label" for="f2" data-i18n="missingBirth">Missing Date of Birth</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="f3" v-model="filters.missingDeath">
              <label class="form-check-label" for="f3" data-i18n="missingDeath">Missing Date of Death</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="f4" v-model="filters.missingMaiden">
              <label class="form-check-label" for="f4" data-i18n="missingMaiden">Females without maiden name</label>
            </div>
            <div class="text-right mt-2">
              <button class="btn btn-primary btn-sm mr-2" @click="showFilter = false" data-i18n="close">Close</button>
            </div>
          </div>
        </div>

        <div v-if="showRelatives" class="modal">
          <div class="modal-content card p-3" style="max-width:90%;">
            <h4 data-i18n="relativeView">Relatives View</h4>
            <div class="form-group">
              <select class="form-control" v-model="relativesMode">
                <option value="descendants" data-i18n="descendantsOnly">Descendants</option>
                <option value="ancestors" data-i18n="ancestorsOnly">Ancestors</option>
                <option value="both" data-i18n="both">Both</option>
              </select>
            </div>
            <div style="width:100%;height:60vh;">
              <VueFlow
                :nodes="relativesNodes"
                :edges="relativesEdges"
                fit-view-on-init="true"
                :min-zoom="0.1"
                :max-zoom="2"
                :zoom-on-scroll="true"
                :pan-on-scroll="true"
                :pan-on-scroll-speed="1"
                :zoom-on-pinch="true"
              />
            </div>
            <div class="text-right mt-2">
              <button class="btn btn-primary btn-sm mr-2" @click="showRelatives = false" data-i18n="close">Close</button>
            </div>
          </div>
        </div>

        <div v-if="showConflict" class="modal">
            <div class="modal-content card p-3">
              <h4 data-i18n="duplicateDetected">Duplicate Detected</h4>
              <p><strong data-i18n="existing">Existing:</strong> {{ conflicts[conflictIndex].existing.firstName }} {{ conflicts[conflictIndex].existing.lastName }}</p>
              <p><strong data-i18n="incoming">Incoming:</strong> {{ conflicts[conflictIndex].incoming.firstName }} {{ conflicts[conflictIndex].incoming.lastName }}</p>
              <div class="text-right">
                <button class="btn btn-sm btn-info mr-2" @click="resolveConflict('keepBoth')" data-i18n="keepBoth">Keep Both</button>
                <button class="btn btn-sm btn-info mr-2" @click="resolveConflict('keepExisting')" data-i18n="keepExisting">Keep Existing</button>
                <button class="btn btn-sm btn-warning mr-2" @click="resolveConflict('overwrite')" data-i18n="overwrite">Overwrite</button>
                <button class="btn btn-sm btn-success" @click="resolveConflict('merge')" data-i18n="merge">Merge</button>
              </div>
            </div>
          </div>

          <div v-if="showModal" class="modal" @click.self="overlayClose">

            <div
              class="modal-content card shadow border-0"
              :style="{
                maxWidth: '500px',
                borderColor: selected.gender === 'female' ? '#f8c' : (selected.gender === 'male' ? '#88f' : '#ccc'),
                borderWidth: '2px',
                borderStyle: 'solid',
              }"
            >
              <div class="card-body p-3" style="position:relative;max-height: 80vh; overflow-y: auto;">
                <button class="icon-button edit-btn" @click="editing = true" title="Edit" data-i18n-title="edit" v-if="!editing && !isNew">
                  <span class="material-icons" style="font-size:16px;">edit</span>
                </button>
                <button class="icon-button copy-btn" @click="copyGedcom" title="Copy GEDCOM" data-i18n-title="copyGedcom">
                  <span class="material-icons" style="font-size:16px;">content_copy</span>
                </button>
                <template v-if="!editing && !isNew">
                  <div class="d-flex align-items-center mb-3">
                    <img :src="avatarSrc(selected.gender, 80)" class="avatar-placeholder mr-3" data-i18n-alt="avatar" />
                    <div class="name-container">
                      <div class="h4 mb-0" :style="{ fontSize: (selected.callName || selected.firstName) && (selected.callName || selected.firstName).length > 15 ? '1rem' : '1.25rem' }">{{ selected.callName || selected.firstName }}</div>
                      <div v-if="selected.callName" class="h4 mb-0" :style="{ fontSize: selected.firstName && selected.firstName.length > 15 ? '1rem' : '1.25rem' }">({{ selected.firstName }})</div>
                      <div class="h4 mb-0" :style="{ fontSize: selected.lastName && selected.lastName.length > 15 ? '1rem' : '1.25rem' }">{{ selected.lastName }}</div>
                    </div>
                  </div>
                  <p v-if="selected.maidenName"><strong data-i18n="maidenNameLabel">Maiden Name:</strong> {{ selected.maidenName }}</p>
                  <p
                    v-if="
                      selected.dateOfBirth ||
                      selected.birthApprox ||
                      selected.dateOfDeath ||
                      selected.deathApprox
                    "
                  >
                    <strong data-i18n="life">Life:</strong>
                    <span v-if="selected.dateOfBirth || selected.birthApprox"
                      >{{ selected.dateOfBirth || selected.birthApprox }}</span
                    >
                    <span
                      v-if="
                        (selected.dateOfBirth || selected.birthApprox) ||
                        (selected.dateOfDeath || selected.deathApprox)
                      "
                      > - </span
                    >
                    <span v-if="selected.dateOfDeath || selected.deathApprox"
                      >{{ selected.dateOfDeath || selected.deathApprox }}</span
                    >
                  </p>
                  <p v-if="selected.placeOfBirth"><strong data-i18n="placeOfBirthLabel">Place of Birth:</strong> {{ selected.placeOfBirth }}</p>
                  <p>
                    <strong data-i18n="fatherLabel">Father:</strong>
                    <template v-if="selected.fatherId">
                      <a href="#" @click.prevent="gotoPerson(selected.fatherId)">{{ personName(selected.fatherId) }}</a>
                    </template>
                    <template v-else>
                      <span class="ml-1" style="cursor: pointer;" @click="startAddParent('father')">
                        <svg viewBox="0 0 24 24" class="text-success" style="width: 16px; height: 16px; vertical-align: middle;">
                          <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                        </svg>
                      </span>
                    </template>
                  </p>
                  <p>
                    <strong data-i18n="motherLabel">Mother:</strong>
                    <template v-if="selected.motherId">
                      <a href="#" @click.prevent="gotoPerson(selected.motherId)">{{ personName(selected.motherId) }}</a>
                    </template>
                    <template v-else>
                      <span class="ml-1" style="cursor: pointer;" @click="startAddParent('mother')">
                        <svg viewBox="0 0 24 24" class="text-success" style="width: 16px; height: 16px; vertical-align: middle;">
                          <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                        </svg>
                      </span>
                    </template>
                  </p>
                  <p v-if="selected.notes"><strong data-i18n="notesLabel">Notes:</strong> {{ selected.notes }}</p>
                  <div v-if="children.length" class="mb-2">
                    <strong data-i18n="childrenLabel">Children:</strong>
                    <ul>
                      <li v-for="c in children" :key="c.id">
                        <a href="#" @click.prevent="gotoPerson(c.id)">{{ personName(c.id) }}</a>
                      </li>
                    </ul>
                  </div>
                  <div class="text-right mt-3">
                    <button class="btn btn-secondary btn-sm" @click="cancelModal" data-i18n="close">Close</button>
                  </div>
                </template>
                <template v-else>
                  <h3 class="card-title" v-if="isNew" data-i18n="addPerson">Add Person</h3>
                  <h3 class="card-title" v-else data-i18n="editPerson">Edit Person</h3>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="callName">Call Name</label>
                      <input class="form-control" v-model="selected.callName" placeholder="Enter call name" title="Preferred name" data-i18n-placeholder="callName" />
                    </div>
                    <div class="col mb-2">
                      <label class="small" data-i18n="firstName">First Name</label>
                      <input class="form-control" v-model="selected.firstName" placeholder="Enter first name" title="Given name" data-i18n-placeholder="firstName" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="lastName">Last Name</label>
                      <input class="form-control" v-model="selected.lastName" placeholder="Enter last name" title="Family name" data-i18n-placeholder="lastName" />
                    </div>
                    <div class="col mb-2">
                      <label class="small" data-i18n="maidenName">Maiden Name</label>
                      <input class="form-control" v-model="selected.maidenName" placeholder="Birth surname" title="Maiden name" data-i18n-placeholder="maidenName" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="gender">Gender</label>
                      <div class="custom-control custom-switch">
                        <input
                          type="checkbox"
                          class="custom-control-input"
                          id="genderSwitch"
                          v-model="selected.gender"
                          true-value="male"
                          false-value="female"
                        />
                        <label class="custom-control-label" for="genderSwitch">
                          <span v-if="selected.gender === 'male'" data-i18n="male">Male</span>
                          <span v-else data-i18n="female">Female</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="dateOfBirth">Date of Birth</label>
                      <input v-if="!useBirthApprox" class="form-control" v-model="selected.dateOfBirth" type="date" title="Birth date" />
                      <input v-else class="form-control" v-model="selected.birthApprox" placeholder="e.g., ABT 1900" title="Approximate birth" data-i18n-placeholder="approxExample" />
                      <div class="custom-control custom-switch ml-2 align-self-center">
                        <input type="checkbox" class="custom-control-input" id="birthApproxSwitch" v-model="useBirthApprox" />
                        <label class="custom-control-label" for="birthApproxSwitch" data-i18n="approx">Approx</label>
                      </div>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2 position-relative">
                      <label class="small" data-i18n="placeOfBirth">Place of Birth</label>
                      <input class="form-control" v-model="selected.placeOfBirth" placeholder="City or town" title="Place of birth" data-i18n-placeholder="placeOfBirth" @focus="placeFocus=true; onPlaceInput($event)" @blur="hidePlaceDropdown" @input="onPlaceInput" />
                      <ul v-if="placeFocus && placeSuggestions.length" class="list-group position-absolute" style="top:100%; left:0; right:0; z-index:1000; max-height:150px; overflow-y:auto;" @scroll="onPlaceScroll">
        <li v-for="s in visiblePlaceSuggestions()" :key="s.geonameId" class="list-group-item list-group-item-action" @mousedown.prevent="applyPlace(s)">{{ s.name }}<span v-if="s.postalCode"> ({{ s.postalCode }})</span><span v-if="s.adminName1">, {{ s.adminName1 }}</span> {{ s.countryCode }}</li>
                        <li class="list-group-item list-group-item-action" @mousedown.prevent="useTypedPlace" data-i18n="useExactly">Use Exactly</li>
                      </ul>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="dateOfDeath">Date of Death</label>
                      <input v-if="!useDeathApprox" class="form-control" v-model="selected.dateOfDeath" type="date" title="Death date" />
                      <input v-else class="form-control" v-model="selected.deathApprox" placeholder="e.g., BEF 1950" title="Approximate death" data-i18n-placeholder="approxExample" />
                      <div class="custom-control custom-switch ml-2 align-self-center">
                        <input type="checkbox" class="custom-control-input" id="deathApproxSwitch" v-model="useDeathApprox" />
                        <label class="custom-control-label" for="deathApproxSwitch" data-i18n="approx">Approx</label>
                      </div>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col mb-2">
                      <label class="small" data-i18n="notes">Notes</label>
                      <textarea class="form-control" v-model="selected.notes" placeholder="Additional info" title="Notes" data-i18n-placeholder="notes"></textarea>
                    </div>
                  </div>
                  <div class="text-right mt-3">
                    <button v-if="!isNew" @click="deleteSelected" class="btn btn-danger btn-sm mr-2" data-i18n="delete">Delete</button>
                    <button v-if="isNew" class="btn btn-primary btn-sm mr-2" @click="saveNewPerson" data-i18n="save">Save</button>
                    <button v-if="!isNew" class="btn btn-secondary btn-sm mr-2" @click="cancelEdit" data-i18n="cancel">Cancel</button>
                    <button class="btn btn-secondary btn-sm" @click="cancelModal">
                      <span v-if="isNew" data-i18n="cancel">Cancel</span>
                      <span v-else data-i18n="close">Close</span>
                    </button>
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

  return { mount, focusNode };
});
