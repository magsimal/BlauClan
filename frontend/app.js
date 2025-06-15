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

  async function deletePerson(id) {
    const res = await fetch(`/api/people/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Failed to delete person');
    }
  }

  async function linkSpouse(personId, spouseId, options = {}) {
    const res = await fetch(`/api/people/${personId}/spouses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spouseId,
        dateOfMarriage: options.dateOfMarriage,
        marriageApprox: options.marriageApprox,
        placeOfMarriage: options.placeOfMarriage,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to link spouse');
    }
    return res.json();
  }

  async function fetchSpouses(personId) {
    const res = await fetch(`/api/people/${personId}/spouses`);
    if (!res.ok) {
      throw new Error('Failed to fetch spouses');
    }
    return res.json();
  }

  async function deleteSpouse(personId, marriageId) {
    const res = await fetch(`/api/people/${personId}/spouses/${marriageId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('Failed to unlink spouse');
    }
  }

  async function clearDatabase() {
    await fetch('/api/import/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ people: [], marriages: [], layouts: [] }),
    });
  }

  function parentName(id, people) {
    const p = people.find((x) => x.id === id);
    if (!p) return '';
    if (p.callName) {
      return `${p.callName} (${p.firstName}) ${p.lastName}`;
    }
    return `${p.firstName} ${p.lastName}`;
  }

  function mountApp() {
    const { createApp } = Vue;
    const app = createApp({
      data() {
        return {
          people: [],
          selectedPerson: null,
          spouses: [],
        };
      },
      async mounted() {
        this.people = await fetchPeople();
      },
      computed: {
        childrenOfSelected() {
          if (!this.selectedPerson) return [];
          return this.people.filter(
            (c) => c.fatherId === this.selectedPerson.id || c.motherId === this.selectedPerson.id
          );
        },
        availableParentOptions() {
          if (!this.selectedPerson) return this.people;
          const excludeIds = new Set([this.selectedPerson.id]);
          this.spouses.forEach((s) => {
            if (s.spouse) excludeIds.add(s.spouse.id);
          });
          this.childrenOfSelected.forEach((c) => excludeIds.add(c.id));
          return this.people.filter((p) => !excludeIds.has(p.id));
        },
      },
      methods: {
        parentName(id) {
          return parentName(id, this.people);
        },
        async updateParents(person) {
          const updates = {
            fatherId: person.fatherId || null,
            motherId: person.motherId || null,
          };
          const updated = await updatePerson(person.id, updates);
          Object.assign(person, updated);
        },
        async selectPerson(person) {
          this.selectedPerson = { ...person };
          this.spouses = await fetchSpouses(person.id);
        },
        async deleteSelected() {
          if (!this.selectedPerson) return;
          await deletePerson(this.selectedPerson.id);
          this.people = this.people.filter((p) => p.id !== this.selectedPerson.id);
          this.selectedPerson = null;
        },
        async unlinkChild(child) {
          const updates = {};
          if (child.fatherId === this.selectedPerson.id) updates.fatherId = null;
          if (child.motherId === this.selectedPerson.id) updates.motherId = null;
          const updated = await updatePerson(child.id, updates);
          const idx = this.people.findIndex((p) => p.id === updated.id);
          if (idx !== -1) Object.assign(this.people[idx], updated);
        },
       async savePerson() {
          if (!this.selectedPerson) return;
          const payload = {
            firstName: this.selectedPerson.firstName,
            callName: this.selectedPerson.callName || '',
            lastName: this.selectedPerson.lastName,
            maidenName: this.selectedPerson.maidenName || '',
            dateOfBirth: this.selectedPerson.dateOfBirth || null,
            birthApprox: this.selectedPerson.birthApprox || null,
            dateOfDeath: this.selectedPerson.dateOfDeath || null,
            deathApprox: this.selectedPerson.deathApprox || null,
            placeOfBirth: this.selectedPerson.placeOfBirth || '',
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

  return {
    fetchPeople,
    createPerson,
    updatePerson,
    deletePerson,
    linkSpouse,
    fetchSpouses,
    deleteSpouse,
    clearDatabase,
    parentName,
    mountApp,
  };
});
