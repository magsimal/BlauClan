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

  async function linkSpouse(personId, spouseId) {
    const res = await fetch(`/api/people/${personId}/spouses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spouseId }),
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
          showAddForm: false,
          newPerson: {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: '',
            motherId: '',
            notes: '',
            relation: null,
          },
          selectedPerson: null,
          spouses: [],
          showSpouseForm: false,
          spouseForm: {
            existingId: '',
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
          },
        };
      },
      async mounted() {
        this.people = await fetchPeople();
      },
      computed: {
        relationDescription() {
          const rel = this.newPerson.relation;
          if (rel) {
            if (rel.type === 'spouse') {
              const sp = this.people.find((p) => p.id === rel.personId);
              return sp ? `is spouse of ${sp.firstName} ${sp.lastName}` : '';
            } else if (rel.type === 'father' || rel.type === 'mother') {
              const child = this.people.find((p) => p.id === rel.childId);
              const role = rel.type === 'father' ? 'father' : 'mother';
              return child ? `is ${role} of ${child.firstName} ${child.lastName}` : '';
            }
          }
          const father = this.parentName(this.newPerson.fatherId);
          const mother = this.parentName(this.newPerson.motherId);
          if (father || mother) {
            if (father && mother) return `is child of ${father} and ${mother}`;
            return `is child of ${father || mother}`;
          }
          return '';
        },
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
        async addPerson() {
          const payload = { ...this.newPerson };
          if (!payload.fatherId) delete payload.fatherId; else payload.fatherId = parseInt(payload.fatherId);
          if (!payload.motherId) delete payload.motherId; else payload.motherId = parseInt(payload.motherId);
          const person = await createPerson(payload);
          if (this.newPerson.relation) {
            const rel = this.newPerson.relation;
            if (rel.type === 'spouse') {
              await linkSpouse(rel.personId, person.id);
            } else if (rel.type === 'father' || rel.type === 'mother') {
              const update = {};
              update[rel.type === 'father' ? 'fatherId' : 'motherId'] = person.id;
              await updatePerson(rel.childId, update);
            }
          }
          this.people.push(person);
         this.newPerson = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: '',
            motherId: '',
            notes: '',
            relation: null,
          };
          this.showAddForm = false;
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
          this.showSpouseForm = false;
        },
        async deleteSelected() {
          if (!this.selectedPerson) return;
          await deletePerson(this.selectedPerson.id);
          this.people = this.people.filter((p) => p.id !== this.selectedPerson.id);
          this.selectedPerson = null;
        },
        prepareAddChild() {
          if (!this.selectedPerson) return;
         this.newPerson = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: this.selectedPerson.gender === 'female' ? '' : this.selectedPerson.id,
            motherId: this.selectedPerson.gender === 'female' ? this.selectedPerson.id : '',
            notes: '',
            relation: null,
          };
          this.showAddForm = true;
        },
       prepareAddSpouse() {
          if (!this.selectedPerson) return;
          this.showSpouseForm = true;
          this.spouseForm = {
            existingId: '',
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
          };
        },
        async confirmAddSpouse() {
          if (!this.selectedPerson) return;
         if (this.spouseForm.existingId) {
            await linkSpouse(this.selectedPerson.id, parseInt(this.spouseForm.existingId));
          } else {
            const payload = {
              firstName: this.spouseForm.firstName,
              lastName: this.spouseForm.lastName,
              maidenName: this.spouseForm.maidenName || undefined,
              dateOfBirth: this.spouseForm.dateOfBirth || undefined,
              dateOfDeath: this.spouseForm.dateOfDeath || undefined,
              placeOfBirth: this.spouseForm.placeOfBirth || undefined,
            };
            const person = await createPerson(payload);
            this.people.push(person);
            await linkSpouse(this.selectedPerson.id, person.id);
          }
          this.spouses = await fetchSpouses(this.selectedPerson.id);
          this.showSpouseForm = false;
        },
        cancelAddSpouse() {
          this.showSpouseForm = false;
        },
        isEligibleSpouse(person) {
          if (!this.selectedPerson) return false;
          return (
            person.id !== this.selectedPerson.id &&
            !this.spouses.some((s) => s.spouse.id === person.id)
          );
        },
        async unlinkChild(child) {
          const updates = {};
          if (child.fatherId === this.selectedPerson.id) updates.fatherId = null;
          if (child.motherId === this.selectedPerson.id) updates.motherId = null;
          const updated = await updatePerson(child.id, updates);
          const idx = this.people.findIndex((p) => p.id === updated.id);
          if (idx !== -1) Object.assign(this.people[idx], updated);
        },
       prepareAddParent(type) {
          if (!this.selectedPerson) return;
          this.newPerson = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: '',
            motherId: '',
            notes: '',
            relation: { type, childId: this.selectedPerson.id },
          };
          this.showAddForm = true;
        },
       openAddForm() {
          this.newPerson = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: '',
            motherId: '',
            notes: '',
            relation: null,
          };
          this.showAddForm = true;
        },
       cancelAddPerson() {
          this.showAddForm = false;
          this.newPerson = {
            firstName: '',
            lastName: '',
            maidenName: '',
            dateOfBirth: '',
            dateOfDeath: '',
            placeOfBirth: '',
            fatherId: '',
            motherId: '',
            notes: '',
            relation: null,
          };
        },
       async savePerson() {
          if (!this.selectedPerson) return;
          const payload = {
            firstName: this.selectedPerson.firstName,
            lastName: this.selectedPerson.lastName,
            maidenName: this.selectedPerson.maidenName || '',
            dateOfBirth: this.selectedPerson.dateOfBirth || null,
            dateOfDeath: this.selectedPerson.dateOfDeath || null,
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
    parentName,
    mountApp,
  };
});
