/**
 * Parse Google Maps / Waze / Apple Maps / geo / raw lat,lng into coordinates.
 * Does not invent coords — returns null/error when none are present.
 */

const ALLOWED_EXACT = new Set([
  'goo.gl',
  'maps.app.goo.gl',
  'waze.com',
  'www.waze.com',
  'ul.waze.com',
  'maps.apple.com',
]);

const GOOGLE_HOST = /^(maps\.|www\.)?google(\.[a-z]{2,3}){1,2}$/i;
const SHORT_HOSTS = new Set(['goo.gl', 'maps.app.goo.gl']);

const PAIR = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

export function isAllowedMapHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (ALLOWED_EXACT.has(host)) return true;
  return GOOGLE_HOST.test(host);
}

export function isShortMapHost(hostname) {
  return SHORT_HOSTS.has(String(hostname || '').toLowerCase().replace(/\.$/, ''));
}

export function isValidLatLng(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180;
}

function parseCoordPair(raw) {
  if (raw == null) return null;
  let text = String(raw).trim();
  try {
    text = decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    text = text.replace(/\+/g, ' ');
  }
  text = text.replace(/^loc:/i, '').trim();
  const m = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function findCoordPair(raw) {
  if (raw == null) return null;
  let text = String(raw);
  try {
    text = decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    /* keep raw */
  }
  const m = text.match(PAIR);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function parseGeoUri(text) {
  const m = String(text).trim().match(/^geo:([^?;]+)/i);
  if (!m) return null;
  return parseCoordPair(m[1].split(';')[0]);
}

function lastBangCoords(href) {
  const re = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g;
  let match;
  let last = null;
  while ((match = re.exec(href))) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (isValidLatLng(lat, lng)) last = { lat, lng };
  }
  return last;
}

function atPathCoords(pathnamePlus) {
  const m = String(pathnamePlus).match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

function queryCoord(url, keys) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const pair = parseCoordPair(value) || findCoordPair(value);
    if (pair) return pair;
  }
  return null;
}

export function extractPlaceName(url) {
  if (!(url instanceof URL)) return '';
  const host = url.hostname.toLowerCase();

  const place = url.pathname.match(/\/maps\/place\/([^/]+)/i);
  if (place) {
    try {
      const name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
      if (name && !parseCoordPair(name)) return name;
    } catch {
      /* ignore */
    }
  }

  const q = url.searchParams.get('q') || url.searchParams.get('query');
  if (q && !parseCoordPair(q) && !findCoordPair(q)) {
    try {
      return decodeURIComponent(q.replace(/\+/g, ' ')).trim();
    } catch {
      return q.trim();
    }
  }

  if (host.includes('waze')) {
    const n = url.searchParams.get('n') || url.searchParams.get('q');
    if (n && !parseCoordPair(n)) {
      try {
        return decodeURIComponent(n.replace(/\+/g, ' ')).trim();
      } catch {
        return String(n).trim();
      }
    }
  }

  return '';
}

export function extractCoordsFromUrl(url) {
  if (!(url instanceof URL)) {
    try {
      url = new URL(String(url));
    } catch {
      return null;
    }
  }

  const href = url.href;
  const bang = lastBangCoords(href);
  if (bang) return bang;

  const fromQuery = queryCoord(url, [
    'll',
    'sll',
    'center',
    'destination',
    'daddr',
    'coordinate',
    'q',
    'query',
    'saddr',
  ]);
  if (fromQuery) return fromQuery;

  const at = atPathCoords(`${url.pathname}${url.search}${url.hash}`);
  if (at) return at;

  const pathPair = url.pathname.match(/\/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (pathPair) {
    const lat = parseFloat(pathPair[1]);
    const lng = parseFloat(pathPair[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

export function extractCoordsFromText(text) {
  if (!text) return null;
  const bang = lastBangCoords(text);
  if (bang) return bang;
  const at = atPathCoords(text);
  if (at) return at;
  const ll = String(text).match(/[?&#]ll=([^&#]+)/i);
  if (ll) {
    const pair = parseCoordPair(ll[1]) || findCoordPair(ll[1]);
    if (pair) return pair;
  }
  return null;
}

function parseWazeProtocol(text) {
  const stripped = String(text).replace(/^waze:\/\//i, 'https://waze.com/');
  try {
    const url = new URL(stripped);
    const coords = extractCoordsFromUrl(url);
    if (coords) return { ...coords, name: extractPlaceName(url), source: 'waze' };
  } catch {
    const ll = String(text).match(/ll=([^&]+)/i);
    if (ll) {
      const pair = parseCoordPair(ll[1]) || findCoordPair(ll[1]);
      if (pair) return { ...pair, source: 'waze' };
    }
  }
  return null;
}

/**
 * @returns {{ lat?: number, lng?: number, name?: string, source?: string, needsExpand?: boolean, error?: string }}
 */
export function parseMapLink(raw) {
  const text = String(raw || '').trim();
  if (!text) return { error: 'empty' };

  const rawPair = parseCoordPair(text);
  if (rawPair) return { ...rawPair, source: 'coords' };

  if (/^geo:/i.test(text)) {
    const geo = parseGeoUri(text);
    if (geo) return { ...geo, source: 'geo' };
    return { error: 'no_coords' };
  }

  if (/^waze:/i.test(text)) {
    const waze = parseWazeProtocol(text);
    if (waze) return waze;
    return { error: 'no_coords' };
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'invalid' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'invalid' };
  }

  if (!isAllowedMapHost(url.hostname)) {
    return { error: 'invalid' };
  }

  const coords = extractCoordsFromUrl(url);
  const name = extractPlaceName(url);
  const short = isShortMapHost(url.hostname);

  if (coords) {
    return { ...coords, name, source: url.hostname };
  }

  return {
    error: short ? 'needs_expand' : 'no_coords',
    needsExpand: true,
    name,
    source: url.hostname,
  };
}

export const MAP_LINK_ERRORS = {
  empty: 'הדביקו קישור מגוגל מפות, ווייז או מפות Apple.',
  invalid: 'הקישור לא תקין. נסו קישור שיתוף מגוגל מפות, ווייז או מפות Apple.',
  no_coords: 'לא הצלחנו למצוא קואורדינטות בקישור. נסו קישור שיתוף אחר (Share / העתקת קישור).',
  needs_expand: 'לא הצלחנו למצוא קואורדינטות בקישור. נסו קישור שיתוף אחר (Share / העתקת קישור).',
};
