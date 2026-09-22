import {
  extractCoordsFromText,
  extractCoordsFromUrl,
  extractPlaceName,
  isAllowedMapHost,
  parseMapLink,
} from './js/map-link.js';

const MAX_REDIRECTS = 5;
const MAX_URL_LEN = 2048;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML = 200_000;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeCandidate(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > MAX_URL_LEN) return null;
  if (/^waze:/i.test(text)) {
    return text.replace(/^waze:\/\//i, 'https://waze.com/');
  }
  if (/^geo:/i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!isAllowedMapHost(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseIfAllowed(href) {
  try {
    const url = new URL(href);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && isAllowedMapHost(url.hostname)) {
      const coords = extractCoordsFromUrl(url);
      const name = extractPlaceName(url);
      if (coords) return { url: url.href, ...coords, name };
      return { url: url.href, name };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function coordsFromHtml(html, baseHref) {
  const slice = String(html || '').slice(0, MAX_HTML);
  const canonical =
    slice.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
    || slice.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || slice.match(/property=["']og:url["'][^>]*content=["']([^"']+)/i)?.[1]
    || slice.match(/content=["']([^"']+)["'][^>]*property=["']og:url["']/i)?.[1];

  if (canonical) {
    try {
      const abs = new URL(canonical, baseHref).href;
      const parsed = parseIfAllowed(abs);
      if (parsed?.lat != null) return parsed;
    } catch {
      /* ignore */
    }
  }

  const fromText = extractCoordsFromText(slice);
  if (fromText) {
    let name = '';
    try {
      name = extractPlaceName(new URL(baseHref));
    } catch {
      /* ignore */
    }
    return { url: baseHref, ...fromText, name };
  }
  return null;
}

async function followRedirects(startHref) {
  let current = startHref;
  let lastHtml = '';
  let lastUrl = startHref;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    let target;
    try {
      target = new URL(current);
    } catch {
      throw new Error('invalid');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('invalid');
    }
    if (!isAllowedMapHost(target.hostname)) {
      throw new Error('invalid');
    }

    const res = await fetch(target.href, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    lastUrl = target.href;
    const location = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, target).href;
      continue;
    }

    if (res.ok) {
      lastHtml = await res.text();
    }
    break;
  }

  return { url: lastUrl, html: lastHtml };
}

async function expandMapUrl(raw) {
  const local = parseMapLink(raw);
  if (local.lat != null && local.lng != null) {
    return {
      url: String(raw).trim(),
      lat: local.lat,
      lng: local.lng,
      name: local.name || '',
    };
  }

  const start = normalizeCandidate(raw);
  if (!start) {
    return { error: 'invalid' };
  }

  const { url: finalUrl, html } = await followRedirects(start);
  const fromFinal = parseIfAllowed(finalUrl);
  if (fromFinal?.lat != null) {
    return {
      url: finalUrl,
      lat: fromFinal.lat,
      lng: fromFinal.lng,
      name: fromFinal.name || '',
    };
  }

  if (html) {
    const fromHtml = coordsFromHtml(html, finalUrl);
    if (fromHtml?.lat != null) {
      return {
        url: fromHtml.url || finalUrl,
        lat: fromHtml.lat,
        lng: fromHtml.lng,
        name: fromHtml.name || fromFinal?.name || '',
      };
    }
    if (fromHtml?.url && fromHtml.url !== finalUrl) {
      const again = parseIfAllowed(fromHtml.url);
      if (again?.lat != null) {
        return {
          url: again.url,
          lat: again.lat,
          lng: again.lng,
          name: again.name || '',
        };
      }
    }
  }

  return {
    url: finalUrl,
    error: 'no_coords',
    name: fromFinal?.name || '',
  };
}

async function readRequestUrl(request) {
  const incoming = new URL(request.url);
  if (request.method === 'GET') {
    return incoming.searchParams.get('url') || '';
  }
  if (request.method !== 'POST') return '';
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return body?.url || '';
  }
  const form = await request.formData().catch(() => null);
  return form?.get('url') || '';
}

async function handleExpandMapUrl(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'method' }, 405);
  }

  const raw = await readRequestUrl(request);
  if (!raw) {
    return json({ error: 'invalid' }, 400);
  }

  try {
    const result = await expandMapUrl(raw);
    if (result.lat != null && result.lng != null) {
      return json({
        url: result.url,
        lat: result.lat,
        lng: result.lng,
        name: result.name || '',
      });
    }
    if (result.error === 'invalid') {
      return json({ error: 'invalid' }, 400);
    }
    return json({
      url: result.url || '',
      error: 'no_coords',
      name: result.name || '',
    }, 422);
  } catch {
    return json({ error: 'expand_failed' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/expand-map-url') {
      return handleExpandMapUrl(request);
    }
    return env.ASSETS.fetch(request);
  },
};
