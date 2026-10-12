const CACHE_NAME = 'senders-ops-v73';
const REELS_MEDIA_CACHE = 'senders-reels-media';

function collectLocalAssetUrls(html, baseHref) {
  const urls = new Set();
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const url = new URL(match[1], baseHref);
      if (url.origin !== self.location.origin) continue;
      if (!/\.(js|css)$/i.test(url.pathname)) continue;
      urls.add(url.href);
    } catch {
      /* ignore */
    }
  }
  return [...urls];
}

async function cacheResponse(cache, requestUrl, response) {
  if (!response || !response.ok) return;
  await cache.put(requestUrl, response.clone());
}

async function precacheReelsShell() {
  const cache = await caches.open(CACHE_NAME);
  const reelsUrl = new URL('/reels.html', self.location.origin).href;
  try {
    const response = await fetch(reelsUrl);
    await cacheResponse(cache, '/reels.html', response);
    await cacheResponse(cache, reelsUrl, response);
    if (!response.ok) return;
    const html = await response.text();
    const assets = collectLocalAssetUrls(html, reelsUrl);
    await Promise.all(
      assets.map(async (href) => {
        try {
          const assetRes = await fetch(href);
          await cacheResponse(cache, href, assetRes);
        } catch {
          /* ignore */
        }
      })
    );
  } catch {
    /* ignore */
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheReelsShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== REELS_MEDIA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return;
  if (url.pathname === '/version.json') return; // always fresh from network
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url.pathname)) return;

  const accept = request.headers.get('accept') || '';
  if (accept.includes('video/')) return;
  const isHtml =
    request.mode === 'navigate' ||
    accept.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/';

  if (isHtml) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = await cache.match('/') || await cache.match('/index.html');
      if (home) return home;
    }
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
