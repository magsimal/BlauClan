(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FrontendApp = factory();
  }
})(this, function () {

  async function fetchPeople() {
    const res = await fetch('/api/people');
    return res.json();
  }

  async function createPerson(person) {
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(person),
    });
    if (!res.ok) {
      throw new Error('Failed to create person');
    }
    return res.json();
  }

  async function updatePerson(id, updates) {
    const res = await fetch(`/api/people/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error('Failed to update person');
    }
    return res.json();
  }

  function parentName(id, people) {
    const p = people.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : '';
  }

  function mountApp() {
    const { createApp } = Vue;
    const app = createApp({
      data() {
        return {
          people: [],
          newPerson: {
            firstName: '',
            lastName: '',
            fatherId: '',
            motherId: '',
            notes: '',
          },
          selectedPerson: null,
        };
      },
      async mounted() {
        this.people = await fetchPeople();
      },
      methods: {
        parentName(id) {
          return parentName(id, this.people);
        },
        async addPerson() {
          const payload = { ...this.newPerson };
          if (!payload.fatherId) delete payload.fatherId; else payload.fatherId = parseInt(payload.fatherId);
          if (!payload.motherId) delete payload.motherId; else payload.motherId = parseInt(payload.motherId);
          const person = await createPerson(payload);
          this.people.push(person);
          this.newPerson = { firstName: '', lastName: '', fatherId: '', motherId: '', notes: '' };
        },
        async updateParents(person) {
          const updates = {
            fatherId: person.fatherId || null,
            motherId: person.motherId || null,
          };
          const updated = await updatePerson(person.id, updates);
          Object.assign(person, updated);
        },
        selectPerson(person) {
          this.selectedPerson = { ...person };
        },
        async savePerson() {
          if (!this.selectedPerson) return;
          const payload = {
            firstName: this.selectedPerson.firstName,
            lastName: this.selectedPerson.lastName,
            fatherId: this.selectedPerson.fatherId || null,
            motherId: this.selectedPerson.motherId || null,
            notes: this.selectedPerson.notes || '',
          };
          const updated = await updatePerson(this.selectedPerson.id, payload);
          const idx = this.people.findIndex((p) => p.id === updated.id);
          if (idx !== -1) Object.assign(this.people[idx], updated);
          this.selectedPerson = null;
        },
      },
    });
    const vm = app.mount('#app');
    return vm;
  }

  return { fetchPeople, createPerson, updatePerson, parentName, mountApp };
});
