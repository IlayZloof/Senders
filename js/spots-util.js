/** צבעי ספוט לפי גובה מקסימלי */
export function spotColor(spot) {
  const max = spot.height_max || spot.height_min || 0;
  if (max > 20) return '#1e293b';
  if (max > 15) return '#ef4444';
  if (max >= 10) return '#f97316';
  return '#38bdf8';
}

export function spotColorLabel(spot) {
  const max = spot.height_max || spot.height_min || 0;
  if (max > 20) return 'מעל 20מ׳';
  if (max > 15) return 'מעל 15מ׳';
  if (max >= 10) return '10–15מ׳';
  return 'עד 8מ׳';
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export const EMPTY_SPOT_MEDIA_TEXT = 'אין תמונות מספוט זה';

const EMPTY_PHOTO_ICON = `<svg class="spot-empty-media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="m21 15-4.8-4.8L3 18"/></svg>`;

/** Gray empty-frame placeholder — never a stock/swimmer photo. */
export function emptySpotMediaHtml({ className = '', compact = false } = {}) {
  const extras = [compact ? 'spot-empty-media--compact' : '', className].filter(Boolean).join(' ');
  return `<div class="spot-empty-media${extras ? ` ${extras}` : ''}" role="img" aria-label="${EMPTY_SPOT_MEDIA_TEXT}">${EMPTY_PHOTO_ICON}<p class="spot-empty-media-text">${EMPTY_SPOT_MEDIA_TEXT}</p></div>`;
}

export const RETIRED_MEDIA_SRCS = new Set(['/videos/spots/migdal-reading-2.mov']);

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
  return /images\.unsplash\.com\/photo-1530549387789/i.test(value);
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
  if (firstPhoto) return firstPhoto;
  if (spot?.image && !isStockPlaceholder(spot.image)) return spot.image;
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

/** Allowed display values: אין | לא ידוע. Maps old booleans / יש / ✅ honestly. */
export function normalizeRocks(value) {
  if (value === undefined || value === null) return ROCKS_UNKNOWN;
  if (value === false || value === 0) return ROCKS_NONE;
  if (value === true || value === 1) return ROCKS_UNKNOWN;
  const raw = String(value).trim();
  if (!raw) return ROCKS_NONE;
  const s = raw.replace(/✅/g, '').trim().toLowerCase();
  if (s === 'אין' || s === 'no' || s === 'false' || s === 'לא') return ROCKS_NONE;
  return ROCKS_UNKNOWN;
}

export function rocksDisplay(spot) {
  return normalizeRocks(spot?.rocks ?? spot?.rocks_below);
}
