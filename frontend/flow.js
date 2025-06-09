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
            if (showModal.value) saveSelected();
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

        async function addPerson() {
          const p = await FrontendApp.createPerson({ firstName: 'New', lastName: 'Person' });
          await load();
          selected.value = { ...p };
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

        return {
          nodes,
          edges,
          onNodeClick,
          onConnect,
          addPerson,
          deleteSelected,
          selected,
          showModal,
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
            <div class="modal-content">
              <h3>Edit Person</h3>
              <input v-model="selected.firstName" placeholder="First Name" />
              <input v-model="selected.lastName" placeholder="Last Name" />
              <input v-model="selected.dateOfBirth" type="date" />
              <input v-model="selected.dateOfDeath" type="date" />
              <select v-model="selected.gender">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <button @click="deleteSelected" class="btn btn-danger btn-sm mr-2">Delete</button>
              <button @click="showModal=false" class="btn btn-secondary btn-sm">Close</button>
            </div>
          </div>
        </div>
      `,
    });

    return app.mount('#flow-app');
  }

  return { mount };
});
