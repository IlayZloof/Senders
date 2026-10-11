import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAllSpots, isFavorite, toggleFavorite, isAdminOnlySpot } from './store.js';
import { heightLabel, wazeNavUrl, googleMapsNavUrl } from './ui.js';
import { regionLabel, t } from './i18n.js';
import { emptySpotMediaHtml, spotColor, getSpotImage } from './spots-util.js';
import { displaySpotName, spotSearchHaystack } from './spot-locale.js';

/** Distinct from height-scale teal / gold / coral / slate — admin-only drafts. */
const ADMIN_ONLY_PIN_COLOR = '#6d28d9';

function pinColor(spot) {
  return isAdminOnlySpot(spot) ? ADMIN_ONLY_PIN_COLOR : spotColor(spot);
}

const ISRAEL_BOUNDS = L.latLngBounds(
  [29.4, 34.2],
  [33.4, 35.9]
);
// Slightly wider than Israel — extra latitude north so spot pins aren't clipped at the top edge
const MAP_PAN_BOUNDS = L.latLngBounds(
  [29.3, 34.1],
  [34.0, 36.0]
);
const ISRAEL_CENTER = [31.5, 34.9];

let mapInstance = null;
let orientationBound = false;

function applyIsraelZoomConstraints(map) {
  const minZ = map.getBoundsZoom(ISRAEL_BOUNDS, false);
  map.setMinZoom(minZ);
  if (map.getZoom() < minZ) {
    map.setZoom(minZ);
  }
}

function spotMatchesQuery(spot, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  return spotSearchHaystack(spot).includes(q);
}

function bindMapSearchSuggestions(searchEl, { spots, filters, refresh, focusSpot }) {
  if (!searchEl) return;

  const wrap = searchEl.closest('.map-search-wrap') || searchEl.parentElement;
  let suggestEl = document.getElementById('mapSearchSuggest');
  if (!suggestEl) {
    suggestEl = document.createElement('ul');
    suggestEl.id = 'mapSearchSuggest';
    suggestEl.className = 'map-search-suggest';
    suggestEl.setAttribute('role', 'listbox');
    suggestEl.setAttribute('aria-label', t('map.searchSuggest'));
  }
  suggestEl.removeAttribute('hidden');
  suggestEl.style.top = '';
  suggestEl.style.left = '';
  suggestEl.style.width = '';
  if (wrap && suggestEl.parentElement !== wrap) wrap.appendChild(suggestEl);

  const hideSuggest = () => {
    suggestEl.classList.remove('is-open');
    suggestEl.innerHTML = '';
    wrap?.classList.remove('is-suggesting');
  };

  const positionSuggest = () => {
    if (!suggestEl.classList.contains('is-open')) return;
    const rect = (wrap || searchEl).getBoundingClientRect();
    const vv = window.visualViewport;
    const vvTop = vv ? vv.offsetTop : 0;
    const vvHeight = vv ? vv.height : window.innerHeight;
    const spaceBelow = vvHeight - (rect.bottom - vvTop) - 8;
    suggestEl.style.maxHeight = `${Math.max(72, spaceBelow)}px`;
  };

  const renderSuggest = () => {
    const q = searchEl.value || '';
    filters.query = q;
    refresh();

    const trimmed = q.trim();
    if (!trimmed) {
      hideSuggest();
      return;
    }

    const matches = spots.filter((spot) => spotMatchesQuery(spot, trimmed)).slice(0, 12);
    if (!matches.length) {
      hideSuggest();
      return;
    }

    suggestEl.innerHTML = matches
      .map(
        (spot) => `
        <li role="presentation">
          <button type="button" class="map-search-suggest-item" role="option" data-id="${spot.id}">
            <strong>${displaySpotName(spot)}</strong>
            <span>${heightLabel(spot)}</span>
          </button>
        </li>
      `
      )
      .join('');
    suggestEl.classList.add('is-open');
    wrap?.classList.add('is-suggesting');
    positionSuggest();
  };

  const pickSpot = (spot) => {
    if (!spot) return;
    searchEl.value = displaySpotName(spot);
    filters.query = displaySpotName(spot);
    hideSuggest();
    refresh();
    focusSpot?.(spot);
  };

  searchEl.addEventListener('input', renderSuggest);
  searchEl.addEventListener('focus', renderSuggest);

  // Keep the keyboard open while tapping a suggestion (iOS).
  suggestEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });

  suggestEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    e.preventDefault();
    const spot = spots.find((s) => s.id === btn.dataset.id);
    pickSpot(spot);
  });

  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSuggest();
  });

  searchEl.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === searchEl) return;
      if (suggestEl.contains(document.activeElement)) return;
      hideSuggest();
    }, 180);
  });

  const schedulePosition = () => positionSuggest();
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, true);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
}

function matchesHeight(spot, heightFilter) {
  if (heightFilter === 'all') return true;
  const max = Number(spot.height_max) || Number(spot.height_min) || 0;
  if (!max) return false;
  if (heightFilter === '0-5') return max <= 5;
  if (heightFilter === '5-10') return max > 5 && max <= 10;
  if (heightFilter === '10-15') return max > 10 && max <= 15;
  if (heightFilter === '15+') return max > 15;
  return true;
}

function popupHtml(spot) {
  const fav = isFavorite(spot.id);
  const img = getSpotImage(spot);
  const photo = img
    ? `<img src="${img}" alt="${displaySpotName(spot)}" class="map-popup-img" />`
    : emptySpotMediaHtml({ className: 'map-popup-img', compact: true });
  return `
    <div class="map-popup">
      ${photo}
      <strong class="map-popup-title">${displaySpotName(spot)}</strong>
      <span class="map-popup-meta">${heightLabel(spot)} · ${regionLabel(spot.region)}${spot.location_approx ? ` · ${t('map.approx')}` : ''}${spot.unverified ? ` · ${t('map.unverified')}` : ''}</span>
      <div class="map-popup-nav">
        <span>${t('map.nav')}</span>
        <a href="${wazeNavUrl(spot.lat, spot.lng, spot.waze_query)}" target="_blank" rel="noopener">${t('map.waze')}</a>
        <a href="${googleMapsNavUrl(spot.lat, spot.lng)}" target="_blank" rel="noopener">${t('map.gmaps')}</a>
      </div>
      <div class="map-popup-actions">
        <a href="spot.html?id=${spot.id}" class="map-popup-details">${t('map.details')}</a>
        <button type="button" class="fav-btn${fav ? ' is-fav' : ''}" data-fav="${spot.id}" aria-label="${t('map.favAria')}">${fav ? t('map.saved') : t('map.save')}</button>
      </div>
    </div>
  `;
}

export async function initMap(containerId, options = {}) {
  const {
    interactive = true,
    onSpotClick,
    showList = false,
    listContainerId,
    filterContainerId,
    heightFilterContainerId,
    searchInputId,
    favFilterId,
  } = options;

  const container = document.getElementById(containerId);
  if (!container) return null;

  container.classList.add('israel-map-host');

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const spots = await getAllSpots();

  mapInstance = L.map(container, {
    scrollWheelZoom: interactive,
    dragging: interactive,
    zoomControl: interactive,
    maxZoom: 16,
    maxBounds: MAP_PAN_BOUNDS,
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
  }).setView(ISRAEL_CENTER, 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
    className: 'ops-map-tiles',
  }).addTo(mapInstance);

  mapInstance.fitBounds(ISRAEL_BOUNDS, {
    paddingTopLeft: L.point(24, 56),
    paddingBottomRight: L.point(24, 24),
  });
  applyIsraelZoomConstraints(mapInstance);
  mapInstance.on('resize', () => applyIsraelZoomConstraints(mapInstance));
  mapInstance.whenReady(() => {
    requestAnimationFrame(() => {
      mapInstance.invalidateSize({ pan: false });
      applyIsraelZoomConstraints(mapInstance);
    });
  });
  if (!orientationBound) {
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (!mapInstance) return;
        mapInstance.invalidateSize({ pan: false });
        applyIsraelZoomConstraints(mapInstance);
      }, 250);
    });
    orientationBound = true;
  }

  const markers = L.layerGroup().addTo(mapInstance);
  const markerById = new Map();
  const filters = {
    region: 'all',
    height: 'all',
    query: '',
    favoritesOnly: false,
  };

  function filteredSpots() {
    const q = filters.query.trim().toLowerCase();
    return spots.filter((spot) => {
      if (filters.region !== 'all' && spot.region !== filters.region) return false;
      if (filters.favoritesOnly && !isFavorite(spot.id)) return false;
      if (q && !spotMatchesQuery(spot, q)) return false;
      if (!matchesHeight(spot, filters.height)) return false;
      return true;
    });
  }

  function renderMarkers() {
    markers.clearLayers();
    markerById.clear();
    filteredSpots().forEach((spot) => {
      const pinText = Number(spot.height_max) || Number(spot.height_min) || '?';
      const draftClass = isAdminOnlySpot(spot) ? ' is-admin-only' : '';
      const icon = L.divIcon({
        className: 'map-marker',
        html: `<div class="map-marker-pin${draftClass}" style="background:${pinColor(spot)}">${pinText}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(markers);
      markerById.set(spot.id, marker);
      marker.bindPopup(popupHtml(spot));
      marker.on('popupopen', () => {
        const btn = document.querySelector(`.fav-btn[data-fav="${spot.id}"]`);
        btn?.addEventListener('click', (e) => {
          e.preventDefault();
          const on = toggleFavorite(spot.id);
          btn.classList.toggle('is-fav', on);
          btn.textContent = on ? t('map.saved') : t('map.save');
          if (filters.favoritesOnly) {
            renderMarkers();
            renderList();
          }
        });
      });

      marker.on('click', () => {
        if (onSpotClick) onSpotClick(spot);
        highlightListItem(spot.id);
      });
    });
  }

  function highlightListItem(spotId) {
    document.querySelectorAll('.map-spot-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === spotId);
    });
  }

  function renderList() {
    if (!showList || !listContainerId) return;
    const listEl = document.getElementById(listContainerId);
    if (!listEl) return;

    const filtered = filteredSpots();
    if (!filtered.length) {
      listEl.innerHTML = `<p class="map-empty">${t('map.empty')}</p>`;
      return;
    }

    listEl.innerHTML = filtered
      .map(
        (spot) => `
        <a href="spot.html?id=${spot.id}" class="map-spot-item" data-id="${spot.id}">
          <span class="map-spot-dot${isAdminOnlySpot(spot) ? ' is-admin-only' : ''}" style="background:${pinColor(spot)}"></span>
          <div>
            <strong>${displaySpotName(spot)}</strong>
            <span>${heightLabel(spot)} · ${regionLabel(spot.region)}${spot.unverified ? ` · ${t('map.unverified')}` : ''}</span>
          </div>
        </a>
      `
      )
      .join('');

    listEl.querySelectorAll('.map-spot-item').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const spot = spots.find((s) => s.id === el.dataset.id);
        if (spot) mapInstance.setView([spot.lat, spot.lng], 11, { animate: true });
      });
    });
  }

  function refresh() {
    renderMarkers();
    renderList();
  }

  if (filterContainerId) {
    const filterEl = document.getElementById(filterContainerId);
    filterEl?.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterEl.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filters.region = btn.dataset.filter;
        refresh();
      });
    });
  }

  if (heightFilterContainerId) {
    const heightEl = document.getElementById(heightFilterContainerId);
    heightEl?.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        heightEl.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filters.height = btn.dataset.height;
        refresh();
      });
    });
  }

  if (searchInputId) {
    const searchEl = document.getElementById(searchInputId);
    bindMapSearchSuggestions(searchEl, {
      spots,
      filters,
      refresh,
      focusSpot: (spot) => {
        highlightListItem(spot.id);
        mapInstance.setView([spot.lat, spot.lng], 13, { animate: true });
        markerById.get(spot.id)?.openPopup();
      },
    });
  }

  if (favFilterId) {
    const favBtn = document.getElementById(favFilterId);
    favBtn?.addEventListener('click', () => {
      filters.favoritesOnly = !filters.favoritesOnly;
      favBtn.classList.toggle('active', filters.favoritesOnly);
      refresh();
    });
  }

  const legendEl = document.querySelector('.map-legend');
  if (legendEl && spots.some(isAdminOnlySpot) && !legendEl.querySelector('[data-admin-only-legend]')) {
    const item = document.createElement('span');
    item.dataset.adminOnlyLegend = '1';
    item.innerHTML = `<i class="map-legend-admin-only" style="background:${ADMIN_ONLY_PIN_COLOR}"></i> ${t('map.legend.draft')}`;
    legendEl.appendChild(item);
  }

  refresh();

  return mapInstance;
}

export function initMiniMap(containerId) {
  return initMap(containerId, { interactive: false });
}
