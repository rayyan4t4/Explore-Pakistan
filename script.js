/* =============================================================
   Pakistan Tourism Map — script.js
   Premium interactive map with clustering, filtering,
   favorites, info panel, search, layer switching, sharing
   ============================================================= */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONSTANTS & STATE
// ─────────────────────────────────────────────────────────────
const PAKISTAN_CENTER = [30.3753, 69.3451];
const PAKISTAN_ZOOM   = 6;
const STORAGE_KEY     = 'pk_map_favorites';

const STATE = {
  activeCategory: 'all',
  activeProvince:  'all',
  activeSort:      'name',
  searchQuery:     '',
  favoritesOnly:   false,
  currentPlace:    null,
  favorites:       new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')),
  markers:         new Map(),   // name → Leaflet marker
  allPlacesData:   places,
};

// ─────────────────────────────────────────────────────────────
// CATEGORY ICONS / COLORS
// ─────────────────────────────────────────────────────────────
const CAT_META = {
  mountain:   { icon: '🏔️', color: '#4dabf7', label: 'Mountain' },
  valley:     { icon: '🌿', color: '#40c057', label: 'Valley'   },
  historical: { icon: '🏛️', color: '#fab005', label: 'Historical'},
  lake:       { icon: '💧', color: '#20c997', label: 'Lake'     },
  beach:      { icon: '🏖️', color: '#fd7e14', label: 'Beach'    },
  city:       { icon: '🏙️', color: '#f03e3e', label: 'City'     },
  wildlife:   { icon: '🦁', color: '#7950f2', label: 'Wildlife' },
  religious:  { icon: '🕌', color: '#e67700', label: 'Religious'},
  desert:     { icon: '🏜️', color: '#e8c27a', label: 'Desert'  },
  default:    { icon: '📍', color: '#adb5bd', label: 'Place'    },
};

function getCatMeta(category) {
  return CAT_META[category] || CAT_META.default;
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ─────────────────────────────────────────────────────────────
// MAP INITIALIZATION
// ─────────────────────────────────────────────────────────────
const TILE_LAYERS = {
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri — Earthstar Geographics',
    maxZoom: 18,
  }),
  terrain: L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png', {
    attribution: '© Stamen Design, ODbL',
    maxZoom: 18,
    subdomains: 'abcd',
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CartoDB',
    maxZoom: 19,
    subdomains: 'abcd',
  }),
};

const map = L.map('map', {
  center: PAKISTAN_CENTER,
  zoom: PAKISTAN_ZOOM,
  minZoom: 4,
  maxZoom: 18,
  zoomControl: false,
  attributionControl: true,
});

// Start with dark tiles (premium look)
TILE_LAYERS.dark.addTo(map);
let currentTileLayer = TILE_LAYERS.dark;
// Mark dark button active by default
document.querySelector('[data-layer="dark"]')?.classList.add('active');
document.querySelector('[data-layer="standard"]')?.classList.remove('active');

// Zoom control position
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// Marker cluster group
const clusterGroup = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 60,
  iconCreateFunction(cluster) {
    const count  = cluster.getChildCount();
    const size   = count > 100 ? 52 : count > 30 ? 44 : 36;
    return L.divIcon({
      html: `<div style="
        width:${size}px;height:${size}px;
        background:rgba(26,127,55,0.85);
        border:2px solid rgba(163,230,53,0.7);
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:700;font-family:Outfit,sans-serif;
        font-size:${count > 99 ? 11 : 13}px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
        backdrop-filter:blur(4px);
      ">${count}</div>`,
      className: '',
      iconSize: [size, size],
    });
  },
});
map.addLayer(clusterGroup);

// ─────────────────────────────────────────────────────────────
// MARKER CREATION
// ─────────────────────────────────────────────────────────────
function createMarkerIcon(category) {
  const meta = getCatMeta(category);
  return L.divIcon({
    html: `<div class="custom-marker marker-${category} marker-default" style="background:${meta.color}">
             <span class="m-icon">${meta.icon}</span>
           </div>`,
    className: '',
    iconSize:  [32, 32],
    iconAnchor:[16, 32],
    popupAnchor:[0, -34],
  });
}

function buildPopupHTML(place) {
  const meta = getCatMeta(place.category);
  const desc = place.description.length > 100
    ? place.description.slice(0, 100) + '…'
    : place.description;
  const isFav = STATE.favorites.has(place.name);
  return `
    <div class="popup-content">
      <img class="popup-img" src="${place.image}" alt="${place.name}" loading="lazy"
           onerror="this.src='https://picsum.photos/seed/${encodeURIComponent(place.name)}/400/200'">
      <div class="popup-info">
        <div class="popup-title">${place.name}</div>
        <div class="popup-meta">
          <span class="popup-province">${place.province}</span>
          <span class="popup-rating">⭐ ${place.rating}</span>
        </div>
        <div class="popup-desc">${desc}</div>
        <button class="popup-btn" onclick="openPanel('${place.name.replace(/'/g,"\\'")}')">
          📖 See Full Details
        </button>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// FILTERING & RENDERING
// ─────────────────────────────────────────────────────────────
function getFilteredPlaces() {
  let data = [...STATE.allPlacesData];

  // Favorites filter
  if (STATE.favoritesOnly) {
    data = data.filter(p => STATE.favorites.has(p.name));
  }

  // Category filter
  if (STATE.activeCategory !== 'all') {
    data = data.filter(p => p.category === STATE.activeCategory);
  }

  // Province filter
  if (STATE.activeProvince !== 'all') {
    data = data.filter(p => p.province === STATE.activeProvince);
  }

  // Search
  if (STATE.searchQuery.length > 0) {
    const q = STATE.searchQuery.toLowerCase();
    data = data.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.province.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  // Sort
  if (STATE.activeSort === 'rating') {
    data.sort((a, b) => b.rating - a.rating);
  } else if (STATE.activeSort === 'province') {
    data.sort((a, b) => a.province.localeCompare(b.province) || a.name.localeCompare(b.name));
  } else {
    data.sort((a, b) => a.name.localeCompare(b.name));
  }

  return data;
}

function renderAll() {
  const filtered = getFilteredPlaces();
  renderMarkers(filtered);
  renderSidebar(filtered);
}

function renderMarkers(data) {
  clusterGroup.clearLayers();
  STATE.markers.clear();

  data.forEach(place => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createMarkerIcon(place.category),
    });

    marker.bindPopup(buildPopupHTML(place), {
      maxWidth: 290,
      minWidth: 240,
      className: 'custom-popup',
    });

    marker.on('click', () => {
      marker.openPopup();
    });

    STATE.markers.set(place.name, marker);
    clusterGroup.addLayer(marker);
  });
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR RENDERING
// ─────────────────────────────────────────────────────────────
function renderSidebar(data) {
  const list = document.getElementById('places-list');
  const countEl = document.getElementById('places-count');
  const labelEl = document.getElementById('filter-label-text');

  countEl.textContent = `${data.length} place${data.length !== 1 ? 's' : ''}`;

  // Label
  let label = STATE.activeCategory === 'all' ? 'All categories' : getCatMeta(STATE.activeCategory).label;
  if (STATE.activeProvince !== 'all') label += ` · ${STATE.activeProvince}`;
  if (STATE.searchQuery) label += ` · "${STATE.searchQuery}"`;
  if (STATE.favoritesOnly) label += ' · Favorites';
  labelEl.textContent = label;

  list.innerHTML = '';

  if (data.length === 0) {
    list.innerHTML = `<li style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
      No places found. Try different filters.</li>`;
    return;
  }

  data.forEach(place => {
    const meta    = getCatMeta(place.category);
    const isFav   = STATE.favorites.has(place.name);
    const isActive = STATE.currentPlace?.name === place.name;

    const li = document.createElement('li');
    li.className = `place-card ${isActive ? 'active' : ''}`;
    li.setAttribute('data-name', place.name);
    li.setAttribute('role', 'listitem');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `${place.name}, ${place.province}`);

    li.innerHTML = `
      <div class="place-card-icon">${meta.icon}</div>
      <div class="place-card-info">
        <div class="place-card-name">${place.name}</div>
        <div class="place-card-meta">
          <span class="place-card-province">${place.province}</span>
          <span class="place-card-rating">⭐ ${place.rating}</span>
        </div>
      </div>
      ${isFav ? '<div class="fav-dot" title="Saved to favorites"></div>' : ''}
    `;

    li.addEventListener('click', () => flyToPlace(place));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') flyToPlace(place);
    });

    list.appendChild(li);
  });
}

// ─────────────────────────────────────────────────────────────
// FLY TO PLACE & OPEN PANEL
// ─────────────────────────────────────────────────────────────
function flyToPlace(place) {
  STATE.currentPlace = place;

  // Update sidebar active state
  document.querySelectorAll('.place-card').forEach(card => {
    card.classList.toggle('active', card.dataset.name === place.name);
  });

  // Fly map
  map.flyTo([place.lat, place.lng], 13, { duration: 1.4 });

  // Open popup
  setTimeout(() => {
    const marker = STATE.markers.get(place.name);
    if (marker) {
      clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
    }
  }, 600);

  // Open info panel
  openPanel(place.name);
}

// Global function for inline popup button
window.openPanel = function(name) {
  const place = STATE.allPlacesData.find(p => p.name === name);
  if (!place) return;

  STATE.currentPlace = place;

  const panel    = document.getElementById('info-panel');
  const meta     = getCatMeta(place.category);
  const isFav    = STATE.favorites.has(place.name);

  // Image
  document.getElementById('panel-image').src = place.image;
  document.getElementById('panel-image').alt = place.name;

  // Badges
  document.getElementById('panel-category-badge').textContent = meta.label;
  document.getElementById('panel-province-badge').textContent = place.province;

  // Title & Rating
  document.getElementById('panel-title').textContent = place.name;
  const stars = renderStars(place.rating);
  document.getElementById('panel-rating').textContent = `${stars} ${place.rating}/5`;

  // Quick info
  document.getElementById('panel-besttime').textContent = place.bestTime || 'Year-round';
  document.getElementById('panel-province').textContent = place.province;
  document.getElementById('panel-category').textContent = meta.label;

  // Tab: Overview
  document.getElementById('panel-description').textContent = place.description;

  // Tab: History
  document.getElementById('panel-history').textContent = place.history || 'Historical details not available yet.';

  // Tab: Travel
  document.getElementById('travel-besttime').textContent   = place.bestTime || 'Year-round';
  document.getElementById('travel-coords').textContent     = `${place.lat.toFixed(4)}°N, ${place.lng.toFixed(4)}°E`;
  document.getElementById('travel-province').textContent   = place.province;
  document.getElementById('travel-rating').textContent     = `${place.rating} / 5 ⭐`;

  // Favorite button
  updateFavButton(isFav);

  // Directions button
  document.getElementById('btn-directions').onclick = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
      '_blank'
    );
  };

  // Share button
  document.getElementById('btn-share').onclick = () => sharePLace(place);

  // Reset to overview tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.add('active');

  // Open panel
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('place', encodeURIComponent(place.name));
  window.history.replaceState({}, '', url);
};

// ─────────────────────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────────────────────
function saveFavorites() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...STATE.favorites]));
}

function updateFavButton(isFav) {
  const btn   = document.getElementById('btn-favorite-place');
  const icon  = btn.querySelector('.fav-icon');
  const label = btn.querySelector('.fav-label');
  if (isFav) {
    icon.textContent  = '❤️';
    label.textContent = 'Remove from Favorites';
    btn.classList.add('favorited');
  } else {
    icon.textContent  = '🤍';
    label.textContent = 'Add to Favorites';
    btn.classList.remove('favorited');
  }
}

document.getElementById('btn-favorite-place').addEventListener('click', () => {
  const place = STATE.currentPlace;
  if (!place) return;

  if (STATE.favorites.has(place.name)) {
    STATE.favorites.delete(place.name);
    updateFavButton(false);
    showToast(`Removed "${place.name}" from favorites`);
  } else {
    STATE.favorites.add(place.name);
    updateFavButton(true);
    showToast(`❤️ Saved "${place.name}" to favorites`);
  }

  saveFavorites();
  if (STATE.favoritesOnly) renderAll();
  else renderSidebar(getFilteredPlaces());
});

// ─────────────────────────────────────────────────────────────
// SHARE
// ─────────────────────────────────────────────────────────────
function sharePLace(place) {
  const url   = `${window.location.origin}${window.location.pathname}?place=${encodeURIComponent(place.name)}`;
  const text  = `Check out ${place.name} in Pakistan! ${url}`;

  if (navigator.share) {
    navigator.share({ title: place.name, text: place.description, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('🔗 Link copied to clipboard!');
    });
  } else {
    showToast(`Share: ${url}`);
  }
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, duration);
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

// ─────────────────────────────────────────────────────────────
// CLOSE PANEL
// ─────────────────────────────────────────────────────────────
document.getElementById('close-panel').addEventListener('click', () => {
  const panel = document.getElementById('info-panel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  STATE.currentPlace = null;

  // Clear sidebar active
  document.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));

  // Clear URL param
  const url = new URL(window.location);
  url.searchParams.delete('place');
  window.history.replaceState({}, '', url);
});

// Close panel on map click
map.on('click', () => {
  const panel = document.getElementById('info-panel');
  if (panel.classList.contains('open')) {
    document.getElementById('close-panel').click();
  }
});

// ─────────────────────────────────────────────────────────────
// FILTER CHIPS
// ─────────────────────────────────────────────────────────────
document.getElementById('filter-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  STATE.activeCategory = chip.dataset.cat;
  renderAll();
});

// ─────────────────────────────────────────────────────────────
// PROVINCE SELECT
// ─────────────────────────────────────────────────────────────
document.getElementById('province-select').addEventListener('change', e => {
  STATE.activeProvince = e.target.value;
  renderAll();
});

// ─────────────────────────────────────────────────────────────
// SORT
// ─────────────────────────────────────────────────────────────
document.getElementById('sort-select').addEventListener('change', e => {
  STATE.activeSort = e.target.value;
  renderAll();
});

// ─────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────
let _searchTimer;
const searchInput     = document.getElementById('search');
const clearBtn        = document.getElementById('clear-search');
const suggestionsBox  = document.getElementById('search-suggestions');

searchInput.addEventListener('input', e => {
  const q = e.target.value.trim();
  STATE.searchQuery = q;
  clearBtn.classList.toggle('hidden', q.length === 0);

  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    renderAll();
    if (q.length >= 1) showSuggestions(q);
    else hideSuggestions();
  }, 180);
});

function showSuggestions(q) {
  const lower  = q.toLowerCase();
  const matches = STATE.allPlacesData
    .filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.province.toLowerCase().includes(lower)
    )
    .slice(0, 8);

  if (matches.length === 0) { hideSuggestions(); return; }

  suggestionsBox.innerHTML = matches.map(p => {
    const meta    = getCatMeta(p.category);
    const nameHL  = highlightMatch(p.name, q);
    return `<div class="suggestion-item" data-name="${p.name}" role="option">
      <span class="sug-cat">${meta.icon}</span>
      <div>
        <div class="suggestion-name">${nameHL}</div>
        <div class="suggestion-province">${p.province}</div>
      </div>
    </div>`;
  }).join('');

  suggestionsBox.classList.remove('hidden');

  suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const place = STATE.allPlacesData.find(p => p.name === item.dataset.name);
      if (place) {
        searchInput.value  = place.name;
        STATE.searchQuery  = place.name;
        clearBtn.classList.remove('hidden');
        hideSuggestions();
        renderAll();
        flyToPlace(place);
      }
    });
  });
}

function hideSuggestions() {
  suggestionsBox.classList.add('hidden');
  suggestionsBox.innerHTML = '';
}

function highlightMatch(text, q) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx)
    + `<span class="suggestion-match">${text.slice(idx, idx + q.length)}</span>`
    + text.slice(idx + q.length);
}

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  STATE.searchQuery = '';
  clearBtn.classList.add('hidden');
  hideSuggestions();
  renderAll();
});

// Hide suggestions on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) hideSuggestions();
});

// ─────────────────────────────────────────────────────────────
// LAYER SWITCHER
// ─────────────────────────────────────────────────────────────
document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const layer = btn.dataset.layer;
    if (!TILE_LAYERS[layer]) return;

    map.removeLayer(currentTileLayer);
    currentTileLayer = TILE_LAYERS[layer];
    map.addLayer(currentTileLayer);

    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ─────────────────────────────────────────────────────────────
// FAVORITES TOGGLE (header button)
// ─────────────────────────────────────────────────────────────
document.getElementById('btn-favorites').addEventListener('click', e => {
  STATE.favoritesOnly = !STATE.favoritesOnly;
  e.currentTarget.classList.toggle('active', STATE.favoritesOnly);
  const label = STATE.favoritesOnly ? '❤️ Favorites (ON)' : '❤️ Favorites';
  e.currentTarget.querySelector('.btn-label').textContent = STATE.favoritesOnly ? 'Favorites ✓' : 'Favorites';
  renderAll();
  if (STATE.favoritesOnly) showToast(`❤️ Showing ${STATE.favorites.size} saved places`);
});

// ─────────────────────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  // Reset state
  STATE.activeCategory = 'all';
  STATE.activeProvince  = 'all';
  STATE.activeSort      = 'name';
  STATE.searchQuery     = '';
  STATE.favoritesOnly   = false;

  // Reset UI
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  hideSuggestions();

  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-cat="all"]').classList.add('active');

  document.getElementById('province-select').value = 'all';
  document.getElementById('sort-select').value = 'name';
  document.getElementById('btn-favorites').classList.remove('active');

  // Close panel
  document.getElementById('close-panel').click();

  // Fly to Pakistan
  map.flyTo(PAKISTAN_CENTER, PAKISTAN_ZOOM, { duration: 1.5 });

  renderAll();
  showToast('🗺️ Map reset to Pakistan view');
});

// ─────────────────────────────────────────────────────────────
// ZOOM TO PAKISTAN
// ─────────────────────────────────────────────────────────────
document.getElementById('zoom-pakistan').addEventListener('click', () => {
  map.flyTo(PAKISTAN_CENTER, PAKISTAN_ZOOM, { duration: 1.2 });
});

// ─────────────────────────────────────────────────────────────
// URL DEEP LINKING — open place from ?place= param
// ─────────────────────────────────────────────────────────────
function checkURLPlace() {
  const params   = new URLSearchParams(window.location.search);
  const placeName = params.get('place');
  if (!placeName) return;

  const decoded = decodeURIComponent(placeName);
  const place   = STATE.allPlacesData.find(p =>
    p.name.toLowerCase() === decoded.toLowerCase()
  );
  if (place) {
    setTimeout(() => flyToPlace(place), 800);
  }
}

// ─────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if (e.key === 'Escape') {
    if (document.getElementById('info-panel').classList.contains('open')) {
      document.getElementById('close-panel').click();
    } else if (suggestionsBox && !suggestionsBox.classList.contains('hidden')) {
      hideSuggestions();
    }
  }
});

// ─────────────────────────────────────────────────────────────
// GEOLOCATION — center on user's location if in Pakistan
// ─────────────────────────────────────────────────────────────
function tryGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    // Rough check if within Pakistan's bounds
    if (lat >= 23 && lat <= 37 && lng >= 60 && lng <= 77) {
      L.circleMarker([lat, lng], {
        radius: 10,
        color: '#58a6ff',
        fillColor: '#58a6ff',
        fillOpacity: 0.4,
        weight: 2,
      }).addTo(map)
        .bindPopup('<strong>You are here</strong>')
        .openPopup();
    }
  }, () => {/* denied, ignore */}, { timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────
// DARK / LIGHT THEME
// ─────────────────────────────────────────────────────────────
const THEME_KEY = 'pk_map_theme';

const LIGHT_TILE = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
});

function applyTheme(theme) {
  const html      = document.documentElement;
  const icon      = document.getElementById('theme-icon');
  const label     = document.getElementById('theme-label');
  const btn       = document.getElementById('btn-theme');

  if (theme === 'light') {
    html.setAttribute('data-theme', 'light');
    icon.textContent  = '☀️';
    label.textContent = 'Light';
    btn.classList.add('active');
    // Switch to light map tiles (if currently on dark tiles)
    if (currentTileLayer === TILE_LAYERS.dark) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = LIGHT_TILE;
      map.addLayer(currentTileLayer);
      // Sync layer button UI
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-layer="standard"]')?.classList.add('active');
    }
  } else {
    html.setAttribute('data-theme', 'dark');
    icon.textContent  = '🌙';
    label.textContent = 'Dark';
    btn.classList.remove('active');
    // Switch back to dark map tiles if we forced light for the theme
    if (currentTileLayer === LIGHT_TILE) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = TILE_LAYERS.dark;
      map.addLayer(currentTileLayer);
      // Sync layer button UI
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-layer="dark"]')?.classList.add('active');
    }
  }

  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showToast(next === 'light' ? '☀️ Switched to Light mode' : '🌙 Switched to Dark mode');
}

function initTheme() {
  // Check saved preference, then system preference
  const saved   = localStorage.getItem(THEME_KEY);
  const system  = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || system);
}

document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
function init() {
  initTheme();
  renderAll();
  checkURLPlace();
  tryGeolocation();
}

init();
