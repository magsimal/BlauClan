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
    const { VueFlow, MarkerType, Handle } = window.VueFlow;

    const app = createApp({
      components: { VueFlow, Handle },
      setup() {
        const nodes = ref([]);
        const edges = ref([]);
        const selected = ref(null);
        const showModal = ref(false);

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

          const marriages = {};
          edges.value = [];

          function marriageKey(f, m) {
            return `${f}-${m}`;
          }

          people.forEach((child) => {
            if (child.fatherId && child.motherId) {
              const key = marriageKey(child.fatherId, child.motherId);
              if (!marriages[key]) {
                const id = `m-${key}`;
                const pos = {
                  x: (positions[child.fatherId].x + positions[child.motherId].x) / 2,
                  y: positions[child.fatherId].y + ySpacing / 2,
                };
                marriages[key] = { id, children: [] };
                nodes.value.push({ id, type: 'marriage', position: pos, data: {} });
                edges.value.push({ id: `${id}-f`, source: String(child.fatherId), target: id });
                edges.value.push({ id: `${id}-m`, source: String(child.motherId), target: id });
              }
              marriages[key].children.push(child.id);
            }
          });

          Object.values(marriages).forEach((m) => {
            m.children.forEach((cid) => {
              edges.value.push({
                id: `${m.id}-${cid}`,
                source: m.id,
                target: String(cid),
                markerEnd: MarkerType.ArrowClosed,
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
              });
            }
          });
        }

        const children = ref([]);

        function computeChildren(pid) {
          children.value = nodes.value
            .filter((n) => n.data.fatherId === pid || n.data.motherId === pid)
            .map((n) => n.data);
        }

        onMounted(load);

        function onNodeClick(evt) {
          selected.value = { ...evt.node.data, spouseId: '' };
          computeChildren(evt.node.data.id);
          showModal.value = true;
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
            if (showModal.value && !isNew.value) saveSelected();
          },
          { deep: true }
        );

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
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            notes: '',
            gender: 'male',
            fatherId: '',
            motherId: '',
            spouseId: '',
          };
          isNew.value = true;
          showModal.value = true;
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

        async function saveNewPerson() {
          const payload = {
            firstName: selected.value.firstName,
            lastName: selected.value.lastName,
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
        }

        return {
          nodes,
          edges,
          onNodeClick,
          onConnect,
          addPerson,
          deleteSelected,
          saveNewPerson,
          cancelModal,
          unlinkChild,
          selected,
          showModal,
          children,
          isNew,
        };
      },
      template: `
        <div>
          <div id="toolbar">
            <button @click="addPerson">+ Add Person</button>
          </div>
          <VueFlow
            style="width: 100%; height: 600px"
            v-model:nodes="nodes"
            v-model:edges="edges"
            @node-click="onNodeClick"
            @connect="onConnect"
            :fit-view="true"
          >
            <template #node-person="{ data }">
              <div class="person-node" :style="{ borderColor: data.gender === 'female' ? '#f8c' : '#88f' }">
                <div class="avatar"></div>
                <div><strong>{{ data.firstName }} {{ data.lastName }}</strong></div>
                <div>{{ data.dateOfBirth }} - {{ data.dateOfDeath }}</div>
                <button class="add-child" @click.stop="addPerson">+</button>
                <Handle type="source" position="right" id="child" />
                <Handle type="target" position="left" id="parent" />
              </div>
            </template>
            <template #node-marriage>
              <div class="marriage-node"></div>
            </template>
          </VueFlow>

          <div v-if="showModal" class="modal">
            <div
              class="modal-content card shadow border-0"
              :style="{
                maxWidth: '500px',
                borderColor: selected.gender === 'female' ? '#f8c' : '#88f',
                borderWidth: '2px',
                borderStyle: 'solid',
              }"
            >
              <div class="card-body p-3">
                <h3 class="card-title" v-if="isNew">Add Person</h3>
                <h3 class="card-title" v-else>Edit Person</h3>
                  <label>First Name</label>
                  <input class="form-control mb-2" v-model="selected.firstName" placeholder="First Name" />
                  <label>Last Name</label>
                  <input class="form-control mb-2" v-model="selected.lastName" placeholder="Last Name" />
                  <label>Date of Birth</label>
                  <input class="form-control mb-2" v-model="selected.dateOfBirth" type="date" />
                  <label>Date of Death</label>
                  <input class="form-control mb-2" v-model="selected.dateOfDeath" type="date" />
                  <label>Place of Birth</label>
                  <input class="form-control mb-2" v-model="selected.placeOfBirth" placeholder="Place of Birth" />
                  <label>Notes</label>
                  <textarea class="form-control mb-2" v-model="selected.notes" placeholder="Notes"></textarea>
                  <label>Gender</label>
                  <select class="form-control mb-2" v-model="selected.gender">
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
                  <button @click="deleteSelected" class="btn btn-danger btn-sm mr-2">Delete</button>
                  <button v-if="isNew" class="btn btn-primary mr-2" @click="saveNewPerson">Save</button>
                  <button class="btn btn-secondary" @click="cancelModal">{{ isNew ? 'Cancel' : 'Close' }}</button>
                </div>

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
