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
    const { createApp, ref, reactive, onMounted, watch } = Vue;
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
          nodes.value = people.map((p, idx) => ({
            id: String(p.id),
            type: 'person',
            position: { x: 100 + idx * 150, y: 100 },
            data: { ...p },
          }));
          edges.value = [];
          people.forEach((p) => {
            if (p.fatherId) {
              edges.value.push({
                id: `f-${p.id}`,
                source: String(p.fatherId),
                target: String(p.id),
                sourceHandle: 'child',
                targetHandle: 'parent',
                markerEnd: MarkerType.ArrowClosed,
              });
            }
            if (p.motherId) {
              edges.value.push({
                id: `m-${p.id}`,
                source: String(p.motherId),
                target: String(p.id),
                sourceHandle: 'child',
                targetHandle: 'parent',
                markerEnd: MarkerType.ArrowClosed,
              });
            }
          });
        }

        onMounted(load);

        function onNodeClick(evt) {
          selected.value = { ...evt.node.data };
          showModal.value = true;
        }

        const saveSelected = debounce(async () => {
          if (!selected.value) return;
          const updated = await FrontendApp.updatePerson(
            selected.value.id,
            selected.value
          );
          Object.assign(selected.value, updated);
          await load();
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
            gender: 'male',
            fatherId: '',
            motherId: '',
            spouseId: '',
          };
          isNew.value = true;
          showModal.value = true;
        }

        async function saveNewPerson() {
          const payload = {
            firstName: selected.value.firstName,
            lastName: selected.value.lastName,
            dateOfBirth: selected.value.dateOfBirth || undefined,
            dateOfDeath: selected.value.dateOfDeath || undefined,
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
          saveNewPerson,
          cancelModal,
          selected,
          showModal,
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
          </VueFlow>

          <div v-if="showModal" class="modal">
            <div class="modal-content" style="max-width:420px;">
              <h3 v-if="isNew">Add Person</h3>
              <h3 v-else>Edit Person</h3>
              <input class="form-control mb-2" v-model="selected.firstName" placeholder="First Name" />
              <input class="form-control mb-2" v-model="selected.lastName" placeholder="Last Name" />
              <input class="form-control mb-2" v-model="selected.dateOfBirth" type="date" />
              <input class="form-control mb-2" v-model="selected.dateOfDeath" type="date" />
              <select class="form-control mb-2" v-model="selected.gender">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <select class="form-control mb-2" v-model="selected.fatherId">
                <option value="">Father</option>
                <option v-for="n in nodes" :key="'f'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
              </select>
              <select class="form-control mb-2" v-model="selected.motherId">
                <option value="">Mother</option>
                <option v-for="n in nodes" :key="'m'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
              </select>
              <select class="form-control mb-2" v-model="selected.spouseId">
                <option value="">Spouse</option>
                <option v-for="n in nodes" :key="'s'+n.id" :value="n.data.id">{{ n.data.firstName }} {{ n.data.lastName }}</option>
              </select>
              <div class="text-right">
                <button v-if="isNew" class="btn btn-primary mr-2" @click="saveNewPerson">Save</button>
                <button class="btn btn-secondary" @click="cancelModal">{{ isNew ? 'Cancel' : 'Close' }}</button>
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
