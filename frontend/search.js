(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.SearchApp = factory();
  }
})(this, function () {
  let people = [];
  let fuse = null;
  const overlayId = 'search-overlay';

  async function init() {
    try {
      const res = await fetch('/api/people');
      people = await res.json();
      fuse = new Fuse(people, { keys: ['firstName', 'lastName', 'callName'], threshold: 0.3 });
    } catch (e) {
      console.error('Failed to load people', e);
      return;
    }
    setupDom();
    document.addEventListener('keydown', handleKeydown);
  }

  function setupDom() {
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'modal';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="modal-content card p-3" style="min-width: 300px;">
        <input type="text" id="search-input" class="form-control mb-2" placeholder="Search..." />
        <ul id="search-results" class="list-group" style="max-height:200px;overflow-y:auto"></ul>
      </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#search-input');
    input.addEventListener('input', updateResults);
    input.addEventListener('keydown', handleInputKey);
  }

  function handleInputKey(e) {
    const list = document.getElementById('search-results');
    const items = Array.from(list.querySelectorAll('li'));
    let idx = items.findIndex((el) => el.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = idx < items.length - 1 ? idx + 1 : 0;
      setActive(items, idx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = idx > 0 ? idx - 1 : items.length - 1;
      setActive(items, idx);
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

  function updateResults(ev) {
    const q = ev.target.value.trim();
    const list = document.getElementById('search-results');
    list.innerHTML = '';
    if (!q) return;
    const results = fuse.search(q, { limit: 10 });
    results.forEach(({ item }) => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';
      li.textContent = `${item.firstName} ${item.lastName}`;
      li.dataset.id = item.id;
      li.addEventListener('click', () => {
        if (global.FlowApp && typeof global.FlowApp.focusNode === 'function') {
          global.FlowApp.focusNode(item.id);
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
    const overlay = document.getElementById(overlayId);
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

  return { init };
});
