(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FlowApp = factory();
  }
})(this, function () {
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function mount() {
    const { createApp, ref, onMounted, watch } = Vue;
    const { VueFlow, MarkerType, Handle, useZoomPanHelper } = window.VueFlow;

    const app = createApp({
      components: { VueFlow, Handle },
      setup() {
        const nodes = ref([]);
        const edges = ref([]);
        const { fitView } = useZoomPanHelper();
        const selected = ref(null);
        const showModal = ref(false);
        const UNION_Y_OFFSET = 20;
        let unions = {};

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

        async function load() {
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
            position: positions[p.id],
            data: { ...p },
          }));

          unions = {};
          edges.value = [];

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
                  position: pos,
                  data: { _gen: idMap[child.fatherId]._gen, helper: true },
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
          refreshUnions();
        }

        const children = ref([]);

        function computeChildren(pid) {
          children.value = nodes.value
            .filter((n) => n.data.fatherId === pid || n.data.motherId === pid)
            .map((n) => n.data);
        }

        onMounted(load);
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
            if (edge.id.startsWith('spouse-line')) {
              edge.class = 'faded-edge';
              return;
            }
            const src = map[edge.source];
            const tgt = map[edge.target];
            if (src?.data.highlight && tgt?.data.highlight) {
              edge.class = 'highlight-edge';
            } else {
              edge.class = 'faded-edge';
            }
          });
        }

        function onNodeClick(evt) {
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
        }

        const saveSelected = debounce(async () => {
          if (!selected.value) return;
          const payload = { ...selected.value };
          const spouseId = payload.spouseId;
          delete payload.spouseId;
          const updated = await FrontendApp.updatePerson(selected.value.id, payload);
          Object.assign(selected.value, updated);
          if (spouseId) {
            await FrontendApp.linkSpouse(updated.id, parseInt(spouseId));
          }
          await load();
          computeChildren(updated.id);
        }, 200);

        watch(
          () => selected.value,
          () => {
            if (editing.value && showModal.value && !isNew.value) saveSelected();
          },
          { deep: true }
        );

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

        async function onConnect(params) {
          const parentId = parseInt(params.source);
          const childId = parseInt(params.target);
          const child = nodes.value.find((n) => n.id === params.target).data;
          const updates = {};
          if (!child.fatherId) updates.fatherId = parentId;
          else if (!child.motherId) updates.motherId = parentId;
          else return;
          await FrontendApp.updatePerson(childId, updates);
          await load();
        }

        const isNew = ref(false);

       function addPerson() {
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
          await load();
        }

        async function unlinkChild(child) {
          const updates = {};
          if (child.fatherId === selected.value.id) updates.fatherId = null;
          if (child.motherId === selected.value.id) updates.motherId = null;
          await FrontendApp.updatePerson(child.id, updates);
          await load();
          computeChildren(selected.value.id);
        }

        function refreshUnions() {
          Object.values(unions).forEach((u) => {
            const father = nodes.value.find((n) => n.id === String(u.fatherId));
            const mother = nodes.value.find((n) => n.id === String(u.motherId));
            const helper = nodes.value.find((n) => n.id === u.id);
            if (father && mother && helper) {
              helper.position = {
                x: (father.position.x + mother.position.x) / 2,
                y: (father.position.y + mother.position.y) / 2 + UNION_Y_OFFSET,
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

       function getChildren(node) {
         const result = [];
         if (node.type === 'person') {
           nodes.value.forEach((n) => {
             if (
               n.data.fatherId === node.data.id ||
               n.data.motherId === node.data.id
             ) {
               result.push(n);
             }
           });
           Object.values(unions).forEach((u) => {
             if (u.fatherId === node.data.id || u.motherId === node.data.id) {
               const helper = nodes.value.find((nd) => nd.id === u.id);
               if (helper) result.push(helper);
             }
           });
         } else if (node.type === 'helper') {
           const u = unions[node.id];
           if (u) {
             u.children.forEach((cid) => {
               const child = nodes.value.find((n) => n.id === String(cid));
               if (child) result.push(child);
             });
           }
         }
         return result;
       }

       function shiftSubtree(rootNode, dx) {
         const visited = new Set();
         function dfs(n) {
           if (!n || visited.has(n.id)) return;
           visited.add(n.id);
           n.position.x += dx;
           getChildren(n).forEach(dfs);
         }
         dfs(rootNode);
       }

       function optimizeLayout() {
         const options = {
           levelSeparation: 200,
           minSiblingSeparation: 100,
           alignFactor: 0.5,
           centerParents: true,
           parentAlignFactor: 0.3,
         };

         const depths = {};
         nodes.value.forEach((n) => {
           depths[n.id] = n.data._gen || 0;
         });

         const idealY = {};
         Object.values(depths).forEach((d) => {
           idealY[d] = d * options.levelSeparation;
         });

         const byGen = {};
         nodes.value.forEach((n) => {
           const g = depths[n.id];
           byGen[g] = byGen[g] || [];
           byGen[g].push(n);
         });

         Object.entries(byGen).forEach(([, list]) => {
           list.sort((a, b) => a.position.x - b.position.x);
           for (let i = 1; i < list.length; i++) {
             const left = list[i - 1];
             const right = list[i];
             const gap = right.position.x - left.position.x;
             if (gap < options.minSiblingSeparation) {
               shiftSubtree(right, options.minSiblingSeparation - gap);
             }
           }
         });

         nodes.value.forEach((n) => {
           const targetY = idealY[depths[n.id]];
           n.position.y += (targetY - n.position.y) * options.alignFactor;
         });

         if (options.centerParents) {
           nodes.value.forEach((p) => {
             if (p.type !== 'person') return;
             const kids = nodes.value.filter(
               (c) => c.data.fatherId === p.data.id || c.data.motherId === p.data.id
             );
             if (kids.length) {
               const centerX =
                 kids.reduce((sum, c) => sum + c.position.x, 0) / kids.length;
               p.position.x += (centerX - p.position.x) * options.parentAlignFactor;
             }
           });
         }

         refreshUnions();
       }

        async function saveNewPerson() {
         const payload = {
            firstName: selected.value.firstName,
            lastName: selected.value.lastName,
            maidenName: selected.value.maidenName || undefined,
            dateOfBirth: selected.value.dateOfBirth || undefined,
            dateOfDeath: selected.value.dateOfDeath || undefined,
            placeOfBirth: selected.value.placeOfBirth || undefined,
            notes: selected.value.notes || undefined,
            gender: selected.value.gender,
            fatherId: selected.value.fatherId || undefined,
            motherId: selected.value.motherId || undefined,
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
          await load();
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

        return {
          nodes,
          edges,
         onNodeClick,
         onPaneClick,
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
         optimizeLayout,
        saveLayout,
         loadLayout,
         fitView,
         onNodeDragStop,
        };
      },
      template: `
        <div style="width: 100%; height: 100%">
          <div id="toolbar">
            <button class="icon-button" @click="addPerson" title="Add Person">
              <svg viewBox="0 0 24 24"><path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5Z"/></svg>
            </button>
            <button class="icon-button" @click="optimizeLayout" title="Optimize Layout">
              <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z" clip-rule="evenodd"/></svg>
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
          </div>
          <VueFlow
            style="width: 100%; height: 100%"
            v-model:nodes="nodes"
            v-model:edges="edges"
            @node-click="onNodeClick"
            @pane-click="onPaneClick"
            @connect="onConnect"
            @node-drag-stop="onNodeDragStop"
            :fit-view="true"
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
              <div class="card-body p-3">
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
                  <div class="mb-2 text-right">
                    <button class="btn btn-info btn-sm mr-1" @click="addChild">New Child</button>
                    <button class="btn btn-info btn-sm mr-1" @click="addSpouse">New Spouse</button>
                    <button class="btn btn-info btn-sm mr-1" @click="addParent('father')">Add Father</button>
                    <button class="btn btn-info btn-sm" @click="addParent('mother')">Add Mother</button>
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
                    <div class="col">
                      <label>First Name</label>
                      <input class="form-control mb-2" v-model="selected.firstName" placeholder="First Name" />
                    </div>
                    <div class="col">
                      <label>Last Name</label>
                      <input class="form-control mb-2" v-model="selected.lastName" placeholder="Last Name" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="col">
                      <label>Date of Birth</label>
                      <input class="form-control mb-2" v-model="selected.dateOfBirth" type="date" />
                    </div>
                    <div class="col">
                      <label>Place of Birth</label>
                      <input class="form-control mb-2" v-model="selected.placeOfBirth" placeholder="Place of Birth" />
                    </div>
                  </div>
                  <button class="btn btn-link p-0 mb-2" type="button" data-toggle="collapse" data-target="#modalDetails">More Details</button>
                  <div id="modalDetails" class="collapse">
                    <label>Maiden Name</label>
                    <input class="form-control mb-2" v-model="selected.maidenName" placeholder="Maiden Name" />
                    <label>Date of Death</label>
                    <input class="form-control mb-2" v-model="selected.dateOfDeath" type="date" />
                    <label>Gender</label>
                    <select class="form-control mb-2" v-model="selected.gender">
                      <option value="">Please select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    <label>Father</label>
                    <select class="form-control mb-2" v-model="selected.fatherId">
                      <option value="">Father</option>
                      <option v-for="n in nodes" :key="'f'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                    </select>
                    <label>Mother</label>
                    <select class="form-control mb-2" v-model="selected.motherId">
                      <option value="">Mother</option>
                      <option v-for="n in nodes" :key="'m'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                    </select>
                    <label>Spouse</label>
                    <select class="form-control mb-2" v-model="selected.spouseId">
                      <option value="">Spouse</option>
                      <option v-for="n in nodes" :key="'s'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
                    </select>
                    <label>Notes</label>
                    <textarea class="form-control mb-2" v-model="selected.notes" placeholder="Notes"></textarea>
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
                    <button v-else class="btn btn-primary mr-2" @click="editing = false">Done</button>
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
