(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.SearchApp = factory();
  }
})(this, function () {
  /* global Fuse */
  const root = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined'
      ? window
      : (typeof self !== 'undefined'
        ? self
        : (typeof global !== 'undefined' ? global : {})));
  const overlayId = 'search-overlay';

  let initialized = false;
  let people = [];
  let simpleIndex = [];
  let fuse = null;
  let buildIdleHandle = null;
  let buildTimeoutHandle = null;
  let scheduledFetchHandle = null;

  function cancelScheduledFetch() {
    if (scheduledFetchHandle) {
      clearTimeout(scheduledFetchHandle);
      scheduledFetchHandle = null;
    }
  }

  function transformPerson(p) {
    const normalized = {
      id: p.id,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      callName: p.callName || '',
      dateOfBirth: p.dateOfBirth || '',
      dateOfDeath: p.dateOfDeath || '',
      birthApprox: p.birthApprox || '',
      deathApprox: p.deathApprox || '',
    };
    normalized.searchKey = [normalized.callName, normalized.firstName, normalized.lastName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return normalized;
  }

  function rebuildSimpleIndex() {
    simpleIndex = people.map((person) => ({
      person,
      haystack: person.searchKey,
    }));
  }

  function cancelScheduledBuild() {
    if (buildIdleHandle !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(buildIdleHandle);
    }
    if (buildTimeoutHandle !== null) {
      clearTimeout(buildTimeoutHandle);
    }
    buildIdleHandle = null;
    buildTimeoutHandle = null;
  }

  function buildFuseIndex() {
    cancelScheduledBuild();
    if (typeof Fuse !== 'function' || !people.length) {
      fuse = null;
      return;
    }
    try {
      fuse = new Fuse(people, {
        keys: ['firstName', 'lastName', 'callName'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
    } catch (e) {
      console.error('Failed to build Fuse index', e);
      fuse = null;
    }
  }

  function scheduleFuseBuild() {
    cancelScheduledBuild();
    if (!people.length) return;
    const build = () => {
      buildFuseIndex();
    };
    if (typeof requestIdleCallback === 'function') {
      buildIdleHandle = requestIdleCallback(build, { timeout: 2000 });
    } else {
      buildTimeoutHandle = setTimeout(build, 250);
    }
  }

  function setPeople(list) {
    const arr = Array.isArray(list) ? list : [];
    people = arr.map(transformPerson);
    rebuildSimpleIndex();
    fuse = null;
    scheduleFuseBuild();
    cancelScheduledFetch();
  }

  function setupDom() {
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.className = 'modal';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="modal-content card p-3" style="min-width: 300px;">
          <input type="text" id="search-input" class="form-control mb-2" data-i18n-placeholder="search" />
          <ul id="search-results" class="list-group" style="max-height:200px;overflow-y:auto"></ul>
        </div>`;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
      document.body.appendChild(overlay);
      if (root.I18n && typeof root.I18n.updateDom === 'function') {
        root.I18n.updateDom();
      }
    }
    const input = overlay.querySelector('#search-input');
    if (!input.dataset.bound) {
      input.addEventListener('input', updateResults);
      input.addEventListener('keydown', handleInputKey);
      input.dataset.bound = 'true';
    }
  }

  function handleInputKey(e) {
    const list = document.getElementById('search-results');
    const items = Array.from(list.querySelectorAll('li'));
    let idx = items.findIndex((el) => el.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = idx < items.length - 1 ? idx + 1 : 0;
      setActive(items, idx);
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = idx > 0 ? idx - 1 : items.length - 1;
      setActive(items, idx);
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0) {
        items[idx].click();
      }
    } else if (e.key === 'Escape') {
      hide();
    }
  }

  function setActive(items, idx) {
    items.forEach((el) => el.classList.remove('active'));
    if (items[idx]) items[idx].classList.add('active');
  }

  function searchFallback(query) {
    if (!query) return [];
    const lower = query.toLowerCase();
    return simpleIndex
      .filter((entry) => entry.haystack.includes(lower))
      .slice(0, 10)
      .map((entry) => entry.person);
  }

  function updateResults(ev) {
    const q = ev.target.value.trim();
    const list = document.getElementById('search-results');
    if (!list) return;
    list.innerHTML = '';
    if (!q) return;

    let results = [];
    if (fuse && typeof fuse.search === 'function') {
      try {
        results = fuse.search(q, { limit: 10 }).map((res) => res.item);
      } catch (e) {
        console.error('Fuse search failed, using fallback', e);
        results = searchFallback(q);
      }
    } else {
      results = searchFallback(q);
    }

    results.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';

      const nameDiv = document.createElement('div');
      const parts = [];
      if (item.firstName) parts.push(item.firstName);
      if (item.lastName) parts.push(item.lastName);
      nameDiv.textContent = parts.join(' ').trim() || String(item.id || '');
      li.appendChild(nameDiv);

      const born = item.dateOfBirth || item.birthApprox || '';
      const died = item.dateOfDeath || item.deathApprox || '';
      const life = [born, died].filter(Boolean).join(' - ');
      if (life) {
        const small = document.createElement('div');
        small.className = 'small text-muted';
        small.textContent = life;
        li.appendChild(small);
      }

      li.dataset.id = item.id;
      li.addEventListener('click', () => {
        if (root.FlowApp && typeof root.FlowApp.focusNode === 'function') {
          root.FlowApp.focusNode(item.id);
        }
        hide();
      });
      list.appendChild(li);
    });
    if (list.firstChild) list.firstChild.classList.add('active');
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      show();
    } else if (e.key === 'Escape') {
      hide();
    }
  }

  function show() {
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      setupDom();
      overlay = document.getElementById(overlayId);
    }
    if (!overlay) return;
    overlay.style.display = 'flex';
    const input = overlay.querySelector('#search-input');
    input.value = '';
    updateResults({ target: input });
    setTimeout(() => input.focus(), 0);
  }

  function hide() {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.style.display = 'none';
  }

  async function fetchAndSetPeople() {
    try {
      const res = await fetch('/api/people');
      const data = await res.json();
      setPeople(data);
    } catch (e) {
      console.error('Failed to load people for search', e);
      setPeople([]);
    }
  }

  function scheduleFetch() {
    cancelScheduledFetch();
    scheduledFetchHandle = setTimeout(() => {
      fetchAndSetPeople();
    }, 800);
  }

  async function init(options = {}) {
    if (initialized) return;
    setupDom();
    document.addEventListener('keydown', handleKeydown);
    initialized = true;

    if (Array.isArray(options.people)) {
      setPeople(options.people);
    } else if (!people.length) {
      scheduleFetch();
    }
  }

  async function refresh(updated) {
    if (Array.isArray(updated)) {
      setPeople(updated);
      return;
    }
    await fetchAndSetPeople();
  }

  return {
    init,
    show,
    hide,
    refresh,
    setPeople,
  };
});
