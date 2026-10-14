import { t } from './i18n.js';
import { displaySpotName, spotNameEquals, spotSearchHaystack } from './spot-locale.js';
import { isUnshippedLocalVideo } from './data-guards.js';

/** צבעי ספוט לפי גובה מקסימלי */
export function spotColor(spot) {
  const max = spot.height_max || spot.height_min || 0;
  if (max > 20) return '#8b9cb3';
  if (max > 15) return '#c45c4a';
  if (max >= 10) return '#c4a35a';
  return '#3d8b8b';
}

export function spotColorLabel(spot) {
  const max = spot.height_max || spot.height_min || 0;
  if (max > 20) return t('band.over20');
  if (max > 15) return t('band.over15');
  if (max >= 10) return t('band.10to15');
  return t('band.upto8');
}

const FALLBACK_IMAGES = {
  'akko-old-city': 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=80',
  'zavitan-glasses': null,
  'zavitan-waterfall': null,
  'tiberias-bridge': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  'alumot-dam': 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80',
  'migdal-reading': null,
};

export function emptySpotMediaText() {
  return t('media.empty');
}

const EMPTY_PHOTO_ICON = `<svg class="spot-empty-media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="m21 15-4.8-4.8L3 18"/></svg>`;

/** Gray empty-frame placeholder — never a stock/swimmer photo. */
export function emptySpotMediaHtml({ className = '', compact = false } = {}) {
  const extras = [compact ? 'spot-empty-media--compact' : '', className].filter(Boolean).join(' ');
  const label = emptySpotMediaText();
  return `<div class="spot-empty-media${extras ? ` ${extras}` : ''}" role="img" aria-label="${label}">${EMPTY_PHOTO_ICON}<p class="spot-empty-media-text">${label}</p></div>`;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export const RETIRED_MEDIA_SRCS = new Set([
  '/videos/spots/migdal-reading-2.mov',
  '/images/spots/fasael-pool.jpg',
  '/images/spots/ein-sataf.jpg',
  '/images/spots/alumot-dam.jpg',
  '/images/spots/alumot-dam-2.jpg',
]);

export function isVideoSrc(src) {
  return VIDEO_EXT.test(String(src || ''));
}

function mediaSources(spot) {
  if (Array.isArray(spot?.media) && spot.media.length) return [...spot.media];
  const list = [];
  if (Array.isArray(spot?.images) && spot.images.length) list.push(...spot.images);
  else if (spot?.image) list.push(spot.image);
  if (Array.isArray(spot?.videos) && spot.videos.length) list.push(...spot.videos);
  return list;
}

function mediaSrc(item) {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') return String(item.src || item.url || '').trim();
  return String(item || '').trim();
}

function mediaCaption(item, captions) {
  if (item && typeof item === 'object' && item.caption) return String(item.caption).trim();
  const src = mediaSrc(item);
  const fromMap = src && captions && typeof captions === 'object' ? captions[src] : '';
  return String(fromMap || '').trim();
}

export function getSpotMedia(spot) {
  const seen = new Set();
  const items = [];
  const captions = spot?.image_captions;
  for (const raw of mediaSources(spot)) {
    const url = mediaSrc(raw);
    if (!url || seen.has(url) || RETIRED_MEDIA_SRCS.has(url) || isStockPlaceholder(url)) continue;
    // Seed /videos/... files are not in the Worker deploy (public/videos gitignored).
    if (isUnshippedLocalVideo(url)) continue;
    seen.add(url);
    const caption = mediaCaption(raw, captions);
    items.push({
      type: isVideoSrc(url) ? 'video' : 'image',
      src: url,
      ...(caption ? { caption } : {}),
    });
  }
  return items;
}

const STOCK_PLACEHOLDER_SRCS = new Set([
  'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1200&q=80',
  'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80',
]);

function isStockPlaceholder(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (STOCK_PLACEHOLDER_SRCS.has(value)) return true;
  return /images\.unsplash\.com\//i.test(value);
}

function isRealPhotoSrc(src) {
  if (!src || isStockPlaceholder(src)) return false;
  return src.startsWith('http') || src.startsWith('/') || src.startsWith('data:');
}

export function getSpotImage(spot) {
  const firstPhoto = mediaSources(spot)
    .map(mediaSrc)
    .find((src) => src && !isVideoSrc(src) && !isStockPlaceholder(src));
  if (isRealPhotoSrc(firstPhoto)) return firstPhoto;
  if (isRealPhotoSrc(spot?.image)) return spot.image;
  if (spot?.id && isRealPhotoSrc(FALLBACK_IMAGES[spot.id])) return FALLBACK_IMAGES[spot.id];
  return '';
}

export function getSpotImages(spot) {
  const photos = getSpotMedia(spot).filter((item) => item.type === 'image').map((item) => item.src);
  if (photos.length) return photos;
  const main = getSpotImage(spot);
  return main ? [main] : [];
}

export function spotImageStyle(spot) {
  const url = getSpotImage(spot);
  return url ? `background-image: url('${url}')` : '';
}

export const ROCKS_LABEL = 'סלעים או עצמים במים';
export const ROCKS_NONE = 'אין';
export const ROCKS_UNKNOWN = 'לא ידוע';

/** Display: אין | לא ידוע | custom Hebrew warning. Maps old booleans / יש / ✅. */
export function normalizeRocks(value) {
  if (value === undefined || value === null) return ROCKS_UNKNOWN;
  if (value === false || value === 0) return ROCKS_NONE;
  if (value === true || value === 1) return ROCKS_UNKNOWN;
  const raw = String(value).trim();
  if (!raw) return ROCKS_NONE;
  const s = raw.replace(/✅/g, '').trim();
  const lower = s.toLowerCase();
  if (lower === 'אין' || lower === 'no' || lower === 'false' || lower === 'לא') return ROCKS_NONE;
  if (
    lower === 'לא ידוע' ||
    lower === 'unknown' ||
    lower === 'יש' ||
    lower === 'yes' ||
    lower === 'true'
  ) {
    return ROCKS_UNKNOWN;
  }
  return s;
}

export function rocksDisplay(spot) {
  return normalizeRocks(spot?.rocks ?? spot?.rocks_below);
}

function escapePickerHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


export function spotMatchesUploadSearch(spot, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return spotSearchHaystack(spot).includes(q);
}

/** Searchable spot list for reel upload. Hidden input still posts `spotId`. */
export function bindUploadSpotPicker(spots) {
  const hidden = document.getElementById('uploadSpot');
  const search = document.getElementById('uploadSpotSearch');
  const list = document.getElementById('uploadSpotList');
  const empty = document.getElementById('uploadSpotEmpty');
  if (!hidden || !search || !list) return { reset() {}, pick() {}, getValue() { return { id: '', name: '' }; } };

  const catalog = (spots || []).filter(Boolean);
  let selectedId = String(hidden.value || '');

  function selectedSpot() {
    return catalog.find((s) => String(s.id) === selectedId) || null;
  }

  function render() {
    const q = search.value;
    const matches = catalog.filter((s) => spotMatchesUploadSearch(s, q));
    list.innerHTML = matches
      .map((s) => {
        const id = String(s.id);
        const on = id === selectedId;
        return `<li>
          <button type="button" class="spot-picker-item${on ? ' is-selected' : ''}" role="option" data-spot-id="${escapePickerHtml(id)}" aria-selected="${on}">
            ${escapePickerHtml(displaySpotName(s) || id)}
          </button>
        </li>`;
      })
      .join('');
    const showEmpty = Boolean(String(q || '').trim()) && matches.length === 0;
    list.hidden = showEmpty;
    if (empty) {
      empty.hidden = !showEmpty;
      empty.textContent = t('home.upload.noSpot');
    }
  }

  function pick(id, name) {
    const spot = catalog.find((s) => String(s.id) === String(id));
    selectedId = spot ? String(spot.id) : '';
    hidden.value = selectedId;
    if (spot) search.value = displaySpotName(spot) || '';
    else if (name) search.value = String(name);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  function getValue() {
    const typed = String(search.value || '').trim();
    const chosen = selectedSpot();
    if (chosen) {
      return { id: String(chosen.id), name: String(chosen.name || typed).trim() };
    }
    const exact = catalog.filter((s) => spotNameEquals(s, typed));
    if (typed && exact.length === 1) {
      return { id: String(exact[0].id), name: String(exact[0].name || typed).trim() };
    }
    return { id: '', name: typed };
  }

  function reset() {
    selectedId = '';
    hidden.value = '';
    search.value = '';
    search.placeholder = t('home.upload.searchSpot');
    render();
  }

  search.addEventListener('input', () => {
    const chosen = selectedSpot();
    if (chosen && search.value.trim() !== String(displaySpotName(chosen) || '').trim()) {
      selectedId = '';
      hidden.value = '';
    }
    render();
  });

  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const typed = String(search.value || '').trim();
    const exact = catalog.filter((s) => spotNameEquals(s, typed));
    if (exact.length === 1) {
      pick(exact[0].id);
      return;
    }
    selectedId = '';
    hidden.value = '';
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-spot-id]');
    if (btn) pick(btn.getAttribute('data-spot-id'));
  });

  document.getElementById('uploadForm')?.addEventListener('reset', () => reset());

  reset();
  return { reset, pick, getValue };
}
