(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.FrontendApp = factory();
  }
})(this, function () {

  async function requestJson(url, opts = {}, errMsg) {
    const headers = opts.body
      ? { 'Content-Type': 'application/json', ...(opts.headers || {}) }
      : opts.headers;
    const options = { ...opts };
    if (headers && Object.keys(headers).length) options.headers = headers;
    const res = await (Object.keys(options).length ? fetch(url, options) : fetch(url));
    if ('ok' in res && !res.ok) throw new Error(errMsg || 'Request failed');
    return res.status === 204 || typeof res.json !== 'function' ? null : res.json();
  }

  const fetchPeople = () => requestJson('/api/people');
  const createPerson = (p) =>
    requestJson('/api/people', { method: 'POST', body: JSON.stringify(p) }, 'Failed to create person');
  const updatePerson = (id, u) =>
    requestJson(`/api/people/${id}`, { method: 'PUT', body: JSON.stringify(u) }, 'Failed to update person');
  const deletePerson = (id) =>
    requestJson(`/api/people/${id}`, { method: 'DELETE' }, 'Failed to delete person');
  const linkSpouse = (personId, spouseId, options = {}) =>
    requestJson(`/api/people/${personId}/spouses`, {
      method: 'POST',
      body: JSON.stringify({ spouseId, ...options }),
    }, 'Failed to link spouse');
  const fetchSpouses = (id) => requestJson(`/api/people/${id}/spouses`);
  const deleteSpouse = (personId, marriageId) =>
    requestJson(`/api/people/${personId}/spouses/${marriageId}`, {
      method: 'DELETE',
    }, 'Failed to unlink spouse');
  const clearDatabase = () =>
    requestJson('/api/import/db', {
      method: 'POST',
      body: JSON.stringify({ people: [], marriages: [], layouts: [] }),
    });

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
    const I18nGlobal = (typeof window !== 'undefined' && window.I18n)
      ? window.I18n
      : { getLang: () => 'en' };
    function debounce(fn, delay) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
      };
    }
    const app = createApp({
      data() {
        return {
          people: [],
          selectedPerson: null,
          spouses: [],
          pobSuggestions: [],
          pobDisplayCount: 5,
          pobFocus: false,
          pobCache: {},
        };
      },
      async mounted() {
        this.people = await fetchPeople();
        let pobController = null;
        this.debouncedPob = debounce(async (val) => {
          if (pobController) pobController.abort();
          const trimmed = (val || '').trim();
          if (!trimmed) { this.pobSuggestions = []; this.pobDisplayCount = 5; return; }
          const cacheKey = trimmed.toLowerCase();
          if (this.pobCache[cacheKey]) {
            this.pobSuggestions = this.pobCache[cacheKey];
            this.pobDisplayCount = 5;
            return;
          }
          pobController = new AbortController();
          const lang = I18nGlobal.getLang ? I18nGlobal.getLang().toLowerCase() : 'en';
          try {
            const res = await fetch(
              `/places/suggest?q=${encodeURIComponent(trimmed)}&lang=${lang}`,
              { signal: pobController.signal },
            );
            this.pobSuggestions = res.ok ? await res.json() : [];
            this.pobDisplayCount = 5;
            this.pobCache[cacheKey] = this.pobSuggestions;
          } catch (e) {
            if (e.name !== 'AbortError') this.pobSuggestions = [];
          }
        }, 250);
      },
      computed: {
        childrenOfSelected() {
          if (!this.selectedPerson) return [];
          return this.people.filter(
            (c) => c.fatherId === this.selectedPerson.id || c.motherId === this.selectedPerson.id
          );
        },
        visiblePobSuggestions() {
          return this.pobSuggestions.slice(0, this.pobDisplayCount);
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
       onPobInput(e) {
          this.pobFocus = true;
          if (this.debouncedPob) this.debouncedPob(e.target.value);
        },
        hidePobDropdown() {
          setTimeout(() => { this.pobFocus = false; }, 150);
        },
        applyPob(s) {
          if (this.selectedPerson) {
            const full =
              s.name
              + (s.postalCode ? ` (${s.postalCode})` : '')
              + (s.adminName1 ? `, ${s.adminName1}` : '')
              + ` ${s.countryCode}`;
            this.selectedPerson.placeOfBirth = full;
            this.selectedPerson.geonameId = s.geonameId;
          }
          this.pobSuggestions = [];
          this.pobFocus = false;
        },
        useTypedPob() {
          if (this.selectedPerson) {
            this.selectedPerson.placeOfBirth = (this.selectedPerson.placeOfBirth || '').trim();
            this.selectedPerson.geonameId = null;
          }
          this.pobFocus = false;
        },
        onPobScroll(e) {
          if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 5) {
            if (this.pobDisplayCount < this.pobSuggestions.length) {
              this.pobDisplayCount += 5;
            }
          }
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
           geonameId: this.selectedPerson.geonameId || null,
           gender: this.selectedPerson.gender || '',
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
