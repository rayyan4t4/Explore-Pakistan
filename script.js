'use strict';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const PAKISTAN_CENTER = [30.3753, 69.3451];
const PAKISTAN_ZOOM   = 6;
const STORAGE_FAV     = 'pk_map_favorites';
const STORAGE_THEME   = 'pk_map_theme';

const CAT_META = {
  mountain:   { icon: '🏔️', label: 'Mountain'  },
  valley:     { icon: '🌿', label: 'Valley'    },
  historical: { icon: '🏛️', label: 'Historical'},
  lake:       { icon: '💧', label: 'Lake'      },
  beach:      { icon: '🏖️', label: 'Beach'     },
  city:       { icon: '🏙️', label: 'City'      },
  wildlife:   { icon: '🦁', label: 'Wildlife'  },
  religious:  { icon: '🕌', label: 'Religious' },
  desert:     { icon: '🏜️', label: 'Desert'   },
  default:    { icon: '📍', label: 'Place'     },
};
const getMeta = cat => CAT_META[cat] || CAT_META.default;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const STATE = {
  cat:       'all',
  province:  'all',
  sort:      'name',
  query:     '',
  favOnly:   false,
  place:     null,
  favorites: new Set(JSON.parse(localStorage.getItem(STORAGE_FAV) || '[]')),
  markerMap: new Map(),   // name → L.marker
};

// ─────────────────────────────────────────────
// MAP SETUP
// ─────────────────────────────────────────────
const LAYERS = {
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri', maxZoom: 18,
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CartoDB', maxZoom: 19, subdomains: 'abcd',
  }),
};

const map = L.map('map', {
  center: PAKISTAN_CENTER, zoom: PAKISTAN_ZOOM,
  minZoom: 4, maxZoom: 18,
  zoomControl: false,
  attributionControl: true,
});

L.control.zoom({ position: 'bottomleft' }).addTo(map);
let activeTile = LAYERS.dark;
activeTile.addTo(map);

// Cluster group
const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 55,
  chunkedLoading: true,
  chunkInterval: 40,
  iconCreateFunction(g) {
    const n    = g.getChildCount();
    const sz   = n > 100 ? 50 : n > 30 ? 42 : 34;
    return L.divIcon({
      html: `<div style="width:${sz}px;height:${sz}px;background:rgba(26,127,55,.85);
               border:2px solid rgba(163,230,53,.7);border-radius:50%;
               display:flex;align-items:center;justify-content:center;
               color:#fff;font-weight:700;font-family:Outfit,sans-serif;
               font-size:${n > 99 ? 10 : 12}px;box-shadow:0 3px 12px rgba(0,0,0,.5)">${n}</div>`,
      className: '', iconSize: [sz, sz],
    });
  },
});
map.addLayer(cluster);

// ─────────────────────────────────────────────
// MARKER ICONS
// ─────────────────────────────────────────────
function makeIcon(cat) {
  const m = getMeta(cat);
  return L.divIcon({
    html: `<div class="custom-marker marker-${cat}"><span class="m-icon">${m.icon}</span></div>`,
    className: '', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32],
  });
}

function popupHTML(p) {
  const desc = p.description.length > 95 ? p.description.slice(0, 95) + '…' : p.description;
  return `<div class="popup-content">
    <img class="popup-img" src="${p.image}" alt="${p.name}" loading="lazy"
         onerror="this.src='https://picsum.photos/seed/${encodeURIComponent(p.name)}/400/200'">
    <div class="popup-info">
      <div class="popup-title">${p.name}</div>
      <div class="popup-meta">
        <span class="popup-province">${p.province}</span>
        <span class="popup-rating">⭐ ${p.rating}</span>
      </div>
      <div class="popup-desc">${desc}</div>
      <button class="popup-btn" onclick="openPanel('${p.name.replace(/'/g, "\\'")}')">📖 Full Details</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// FILTER + SORT
// ─────────────────────────────────────────────
function getFiltered() {
  let data = places;

  if (STATE.favOnly)           data = data.filter(p => STATE.favorites.has(p.name));
  if (STATE.cat !== 'all')     data = data.filter(p => p.category === STATE.cat);
  if (STATE.province !== 'all')data = data.filter(p => p.province === STATE.province);

  if (STATE.query) {
    const q = STATE.query.toLowerCase();
    data = data.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.province.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  // Sort — create a shallow copy only when needed
  if (STATE.sort === 'rating') {
    data = data.slice().sort((a, b) => b.rating - a.rating);
  } else if (STATE.sort === 'province') {
    data = data.slice().sort((a, b) => a.province.localeCompare(b.province) || a.name.localeCompare(b.name));
  } else {
    data = data.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  return data;
}

// ─────────────────────────────────────────────
// RENDER — uses DocumentFragment for perf
// ─────────────────────────────────────────────
let _renderPending = false;

function scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => {
    _renderPending = false;
    renderAll();
  });
}

function renderAll() {
  const data = getFiltered();
  renderMarkers(data);
  renderSidebar(data);
}

function renderMarkers(data) {
  cluster.clearLayers();
  STATE.markerMap.clear();

  const layers = [];
  for (const p of data) {
    const m = L.marker([p.lat, p.lng], { icon: makeIcon(p.category) });
    m.bindPopup(popupHTML(p), { maxWidth: 275, minWidth: 220 });
    STATE.markerMap.set(p.name, m);
    layers.push(m);
  }
  cluster.addLayers(layers);
}

function renderSidebar(data) {
  const countEl = document.getElementById('places-count');
  const labelEl = document.getElementById('filter-label-text');
  const list    = document.getElementById('places-list');

  countEl.textContent = `${data.length} place${data.length !== 1 ? 's' : ''}`;

  let label = STATE.cat === 'all' ? '' : getMeta(STATE.cat).label;
  if (STATE.province !== 'all') label += (label ? ' · ' : '') + STATE.province;
  if (STATE.query)               label += (label ? ' · ' : '') + `"${STATE.query}"`;
  if (STATE.favOnly)             label += (label ? ' · ' : '') + '❤️';
  labelEl.textContent = label;

  const frag = document.createDocumentFragment();

  if (data.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'padding:20px;text-align:center;color:var(--text-muted);font-size:13px';
    li.textContent = 'No places found.';
    frag.appendChild(li);
  } else {
    for (const p of data) {
      const meta  = getMeta(p.category);
      const isFav = STATE.favorites.has(p.name);
      const active = STATE.place?.name === p.name;

      const li = document.createElement('li');
      li.className = `place-card${active ? ' active' : ''}`;
      li.dataset.name = p.name;

      li.innerHTML = `
        <div class="place-card-icon">${meta.icon}</div>
        <div class="place-card-info">
          <div class="place-card-name">${p.name}</div>
          <div class="place-card-meta">
            <span class="place-card-province">${p.province}</span>
            <span class="place-card-rating">⭐ ${p.rating}</span>
          </div>
        </div>
        ${isFav ? '<div class="fav-dot"></div>' : ''}`;

      li.addEventListener('click', () => {
        closeSidebar();  // on mobile close sidebar when selecting a place
        flyTo(p);
      });

      frag.appendChild(li);
    }
  }

  list.innerHTML = '';
  list.appendChild(frag);
}

// ─────────────────────────────────────────────
// FLY + OPEN PANEL
// ─────────────────────────────────────────────
function flyTo(p) {
  STATE.place = p;

  // update sidebar active
  document.querySelectorAll('.place-card').forEach(el =>
    el.classList.toggle('active', el.dataset.name === p.name)
  );

  map.flyTo([p.lat, p.lng], 13, { duration: 1.2 });

  setTimeout(() => {
    const m = STATE.markerMap.get(p.name);
    if (m) cluster.zoomToShowLayer(m, () => m.openPopup());
  }, 500);

  openPanel(p.name);
}

// Global for popup button
window.openPanel = function(name) {
  const p = places.find(x => x.name === name);
  if (!p) return;
  STATE.place = p;

  const meta  = getMeta(p.category);
  const isFav = STATE.favorites.has(p.name);

  document.getElementById('panel-image').src         = p.image;
  document.getElementById('panel-image').alt         = p.name;
  document.getElementById('panel-category-badge').textContent = meta.label;
  document.getElementById('panel-province-badge').textContent = p.province;
  document.getElementById('panel-title').textContent = p.name;
  document.getElementById('panel-rating').textContent = `⭐ ${p.rating} / 5`;
  document.getElementById('panel-besttime').textContent = p.bestTime || 'Year-round';
  document.getElementById('panel-province').textContent = p.province;
  document.getElementById('panel-description').textContent = p.description;
  document.getElementById('panel-history').textContent    = p.history || 'Historical details not yet available.';

  updateFavBtn(isFav);

  document.getElementById('btn-directions').onclick = () =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, '_blank');
  document.getElementById('btn-share').onclick = () => share(p);

  // open panel
  document.getElementById('info-panel').classList.add('open');
  document.getElementById('info-panel').setAttribute('aria-hidden', 'false');

  // update sidebar highlight
  document.querySelectorAll('.place-card').forEach(el =>
    el.classList.toggle('active', el.dataset.name === p.name)
  );
};

function closePanel() {
  document.getElementById('info-panel').classList.remove('open');
  document.getElementById('info-panel').setAttribute('aria-hidden', 'true');
  STATE.place = null;
  document.querySelectorAll('.place-card').forEach(el => el.classList.remove('active'));
}

document.getElementById('close-panel').addEventListener('click', closePanel);
map.on('click', closePanel);

// ─────────────────────────────────────────────
// SIDEBAR TOGGLE (mobile)
// ─────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.getElementById('btn-menu')?.addEventListener('click', openSidebar);
document.getElementById('btn-fab')?.addEventListener('click', openSidebar);
document.getElementById('btn-sidebar-close')?.addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

// ─────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────
function saveFavs() {
  localStorage.setItem(STORAGE_FAV, JSON.stringify([...STATE.favorites]));
}

function updateFavBtn(isFav) {
  const btn   = document.getElementById('btn-favorite-place');
  btn.querySelector('.fav-icon').textContent  = isFav ? '❤️' : '🤍';
  btn.querySelector('.fav-label').textContent = isFav ? 'Saved' : 'Save';
  btn.classList.toggle('favorited', isFav);
}

document.getElementById('btn-favorite-place').addEventListener('click', () => {
  const p = STATE.place; if (!p) return;
  const isFav = STATE.favorites.has(p.name);
  isFav ? STATE.favorites.delete(p.name) : STATE.favorites.add(p.name);
  updateFavBtn(!isFav);
  saveFavs();
  toast(isFav ? `Removed from favorites` : `❤️ Saved!`);
  if (STATE.favOnly) scheduleRender();
  else renderSidebar(getFiltered());
});

// Favorites header toggle
document.getElementById('btn-favorites').addEventListener('click', () => {
  STATE.favOnly = !STATE.favOnly;
  document.getElementById('btn-favorites').classList.toggle('active', STATE.favOnly);
  scheduleRender();
  if (STATE.favOnly) toast(`❤️ Showing ${STATE.favorites.size} saved places`);
});

// ─────────────────────────────────────────────
// SHARE
// ─────────────────────────────────────────────
function share(p) {
  const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(p.name)}`;
  if (navigator.share) {
    navigator.share({ title: p.name, text: p.description.slice(0, 80), url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toast('🔗 Link copied!'));
  }
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let _tt;
function toast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth; // force reflow
  el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 350);
  }, dur);
}

// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────
const searchEl   = document.getElementById('search');
const clearBtn   = document.getElementById('clear-search');
const suggestBox = document.getElementById('search-suggestions');
let _st;

searchEl.addEventListener('input', e => {
  const q = e.target.value.trim();
  STATE.query = q;
  clearBtn.classList.toggle('hidden', q.length === 0);
  clearTimeout(_st);
  _st = setTimeout(() => {
    scheduleRender();
    q.length >= 1 ? showSuggestions(q) : hideSuggestions();
  }, 200);
});

function showSuggestions(q) {
  const lower = q.toLowerCase();
  const hits  = places.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 7);
  if (!hits.length) { hideSuggestions(); return; }

  const frag = document.createDocumentFragment();
  for (const p of hits) {
    const meta = getMeta(p.category);
    const idx  = p.name.toLowerCase().indexOf(lower);
    const hl   = p.name.slice(0, idx)
               + `<span class="suggestion-match">${p.name.slice(idx, idx + q.length)}</span>`
               + p.name.slice(idx + q.length);
    const div  = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `<span class="sug-cat">${meta.icon}</span>
      <div><div class="suggestion-name">${hl}</div>
           <div class="suggestion-province">${p.province}</div></div>`;
    div.addEventListener('click', () => {
      searchEl.value = p.name;
      STATE.query    = p.name;
      clearBtn.classList.remove('hidden');
      hideSuggestions();
      scheduleRender();
      flyTo(p);
    });
    frag.appendChild(div);
  }
  suggestBox.innerHTML = '';
  suggestBox.appendChild(frag);
  suggestBox.classList.remove('hidden');
}

function hideSuggestions() {
  suggestBox.innerHTML = '';
  suggestBox.classList.add('hidden');
}

clearBtn.addEventListener('click', () => {
  searchEl.value = ''; STATE.query = '';
  clearBtn.classList.add('hidden');
  hideSuggestions();
  scheduleRender();
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) hideSuggestions();
});

// ─────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────
document.getElementById('filter-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  STATE.cat = chip.dataset.cat;
  scheduleRender();
});

document.getElementById('province-select').addEventListener('change', e => {
  STATE.province = e.target.value; scheduleRender();
});

document.getElementById('sort-select').addEventListener('change', e => {
  STATE.sort = e.target.value; scheduleRender();
});

// ─────────────────────────────────────────────
// LAYER SWITCHER
// ─────────────────────────────────────────────
document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.layer;
    if (!LAYERS[key] || activeTile === LAYERS[key]) return;
    map.removeLayer(activeTile);
    activeTile = LAYERS[key];
    map.addLayer(activeTile);
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ─────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────
document.getElementById('btn-reset')?.addEventListener('click', reset);

function reset() {
  STATE.cat = 'all'; STATE.province = 'all'; STATE.sort = 'name';
  STATE.query = ''; STATE.favOnly = false;

  searchEl.value = '';
  clearBtn.classList.add('hidden');
  hideSuggestions();

  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-cat="all"]').classList.add('active');
  document.getElementById('province-select').value = 'all';
  document.getElementById('sort-select').value = 'name';
  document.getElementById('btn-favorites').classList.remove('active');

  closePanel();
  map.flyTo(PAKISTAN_CENTER, PAKISTAN_ZOOM, { duration: 1.2 });
  scheduleRender();
  toast('🗺️ Map reset');
}

// ─────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault(); searchEl.focus(); searchEl.select();
  }
  if (e.key === 'Escape') {
    if (document.getElementById('info-panel').classList.contains('open')) closePanel();
    else hideSuggestions();
  }
});

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'light' ? '☀️' : '🌙';
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = theme === 'light' ? 'Light' : 'Dark';

  // Sync tile layer with theme
  const want = theme === 'light' ? LAYERS.standard : LAYERS.dark;
  if (activeTile === LAYERS.dark || activeTile === LAYERS.standard) {
    if (activeTile !== want) {
      map.removeLayer(activeTile);
      activeTile = want;
      map.addLayer(activeTile);
      const key  = theme === 'light' ? 'standard' : 'dark';
      document.querySelectorAll('.layer-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.layer === key)
      );
    }
  }

  localStorage.setItem(STORAGE_THEME, theme);
}

document.getElementById('btn-theme').addEventListener('click', () => {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast(next === 'light' ? '☀️ Light mode' : '🌙 Dark mode');
});

function initTheme() {
  const saved  = localStorage.getItem(STORAGE_THEME);
  const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || system);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
initTheme();
renderAll();

// ─────────────────────────────────────────────
// DEVELOPER MODAL
// ─────────────────────────────────────────────
(function () {
  const modal   = document.getElementById('dev-modal');
  const overlay = document.getElementById('dev-overlay');
  const openBtn = document.getElementById('btn-developer');
  const closeBtn= document.getElementById('dev-close');

  function openDev() {
    modal.classList.add('open');
    overlay.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeDev() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  openBtn?.addEventListener('click', openDev);
  closeBtn?.addEventListener('click', closeDev);
  overlay?.addEventListener('click', closeDev);

  // Close on Escape (already handled globally — extend it)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) closeDev();
  }, true);
})();
