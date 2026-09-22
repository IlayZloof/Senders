import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAllSpots, REGION_LABELS, isFavorite, toggleFavorite } from './store.js';
import { heightLabel, wazeNavUrl, googleMapsNavUrl } from './ui.js';
import { emptySpotMediaHtml, getSpotImage, spotColor } from './spots-util.js';

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
    ? `<img src="${img}" alt="${spot.name}" class="map-popup-img" />`
    : emptySpotMediaHtml({ className: 'map-popup-img', compact: true });
  return `
    <div class="map-popup">
      ${photo}
      <strong>${spot.name}</strong>
      <span>${heightLabel(spot)} · ${REGION_LABELS[spot.region]}${spot.location_approx ? ' · משוער' : ''}${spot.unverified ? ' · לא אומת' : ''}</span>
      <div class="map-popup-nav">
        <span>ניווט:</span>
        <a href="${wazeNavUrl(spot.lat, spot.lng, spot.waze_query)}" target="_blank" rel="noopener">Waze</a>
        <a href="${googleMapsNavUrl(spot.lat, spot.lng)}" target="_blank" rel="noopener">Google Maps</a>
      </div>
      <div class="map-popup-actions">
        <a href="spot.html?id=${spot.id}">פרטים →</a>
        <button type="button" class="fav-btn${fav ? ' is-fav' : ''}" data-fav="${spot.id}" aria-label="מועדפים">${fav ? '♥ שמור' : '♡ שמירה'}</button>
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
      if (q) {
        const name = String(spot.name || '').toLowerCase();
        const aliases = (spot.aliases || []).map((a) => String(a).toLowerCase());
        if (!name.includes(q) && !aliases.some((a) => a.includes(q))) return false;
      }
      if (!matchesHeight(spot, filters.height)) return false;
      return true;
    });
  }

  function renderMarkers() {
    markers.clearLayers();
    filteredSpots().forEach((spot) => {
      const pinText = Number(spot.height_max) || Number(spot.height_min) || '?';
      const icon = L.divIcon({
        className: 'map-marker',
        html: `<div class="map-marker-pin" style="background:${spotColor(spot)}">${pinText}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(markers);
      marker.bindPopup(popupHtml(spot));
      marker.on('popupopen', () => {
        const btn = document.querySelector(`.fav-btn[data-fav="${spot.id}"]`);
        btn?.addEventListener('click', (e) => {
          e.preventDefault();
          const on = toggleFavorite(spot.id);
          btn.classList.toggle('is-fav', on);
          btn.textContent = on ? '♥ שמור' : '♡ שמירה';
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
      listEl.innerHTML = '<p class="map-empty">אין ספוטים לפי הסינון הזה.</p>';
      return;
    }

    listEl.innerHTML = filtered
      .map(
        (spot) => `
        <a href="spot.html?id=${spot.id}" class="map-spot-item" data-id="${spot.id}">
          <span class="map-spot-dot" style="background:${spotColor(spot)}"></span>
          <div>
            <strong>${spot.name}${spot.unverified ? ' · לא אומת' : ''}</strong>
            <span>${heightLabel(spot)} · ${REGION_LABELS[spot.region]}</span>
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
    searchEl?.addEventListener('input', () => {
      filters.query = searchEl.value || '';
      refresh();
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

  refresh();

  return mapInstance;
}

export function initMiniMap(containerId) {
  return initMap(containerId, { interactive: false });
}
