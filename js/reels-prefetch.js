import { getJumpVideos } from './store.js';

export const REELS_PLAYLIST_KEY = 'senders-reels-playlist-v1';
export const REELS_MEDIA_CACHE = 'senders-reels-media';
const PLAYLIST_LIMIT = 16;

function slimVideo(video) {
  if (!video?.id || !video?.videoUrl) return null;
  return {
    id: String(video.id),
    userId: video.userId || '',
    displayName: video.displayName || '',
    spotId: video.spotId || '',
    spotName: video.spotName || '',
    caption: video.caption || '',
    videoUrl: String(video.videoUrl),
    createdAt: video.createdAt || '',
    avatarUrl: video.avatarUrl || '',
    likeCount: Number(video.likeCount) || 0,
    commentCount: Number(video.commentCount) || 0,
    liked: Boolean(video.liked),
    saved: Boolean(video.saved),
  };
}

export function readCachedReelsPlaylist() {
  try {
    const raw = localStorage.getItem(REELS_PLAYLIST_KEY) || sessionStorage.getItem(REELS_PLAYLIST_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const list = Array.isArray(data?.videos) ? data.videos : Array.isArray(data) ? data : [];
    return list.map(slimVideo).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeCachedReelsPlaylist(videos) {
  const payload = {
    ts: Date.now(),
    videos: (videos || []).map(slimVideo).filter(Boolean).slice(0, PLAYLIST_LIMIT),
  };
  if (!payload.videos.length) return;
  const json = JSON.stringify(payload);
  try {
    localStorage.setItem(REELS_PLAYLIST_KEY, json);
  } catch {
    /* quota */
  }
  try {
    sessionStorage.setItem(REELS_PLAYLIST_KEY, json);
  } catch {
    /* quota */
  }
}

/** Only warm video files on a decent connection and when Data Saver is off. */
function canPrefetchVideos() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  const type = String(conn.effectiveType || '').toLowerCase();
  if (type === 'slow-2g' || type === '2g' || type === '3g') return false;
  return true;
}

function isCellular() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return String(conn?.type || '').toLowerCase() === 'cellular';
}

/** Keep the first N reels' files in Cache Storage (playback starts from a local blob). */
const MEDIA_KEEP = 2;
/** Never download whole clips bigger than this in the background (iPhone .mov can be 30MB+). */
const MEDIA_MAX_BYTES = 12 * 1024 * 1024;
const MEDIA_MAX_BYTES_CELLULAR = 6 * 1024 * 1024;

async function openMediaCache() {
  if (!('caches' in window)) return null;
  try {
    return await caches.open(REELS_MEDIA_CACHE);
  } catch {
    return null;
  }
}

export async function hasCachedReelMedia(src) {
  const url = String(src || '').trim();
  if (!url) return false;
  const cache = await openMediaCache();
  if (!cache) return false;
  try {
    const match = await cache.match(url);
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function getCachedReelObjectUrl(src) {
  const url = String(src || '').trim();
  if (!url) return '';
  const cache = await openMediaCache();
  if (!cache) return '';
  try {
    const match = await cache.match(url);
    if (!match || !match.ok) return '';
    const blob = await match.blob();
    if (!blob || !blob.size) return '';
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
}

/**
 * Download one clip into Cache Storage. `keep` lists the URLs that may stay
 * cached (everything else is evicted so the cache never grows past a couple
 * of clips). Clips larger than the size cap are skipped: they stream normally.
 */
export async function cacheReelMedia(src, { keep = null, maxBytes = MEDIA_MAX_BYTES } = {}) {
  const url = String(src || '').trim();
  if (!url) return false;
  const cache = await openMediaCache();
  if (!cache) return false;
  const keepSet = new Set((keep && keep.length ? keep : [url]).map(String));
  const evict = async () => {
    try {
      const keys = await cache.keys();
      await Promise.all(
        keys.filter((request) => !keepSet.has(request.url)).map((request) => cache.delete(request))
      );
    } catch {
      /* ignore */
    }
  };
  try {
    const existing = await cache.match(url);
    if (existing && existing.ok) {
      await evict();
      return true;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller?.signal,
    });
    if (!response.ok) return false;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared && declared > maxBytes) {
      controller?.abort();
      return false;
    }
    const blob = await response.blob();
    if (!blob.size || blob.size > maxBytes) return false;
    const stored = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': blob.type || response.headers.get('content-type') || 'video/mp4',
        'Content-Length': String(blob.size),
      },
    });
    await cache.put(url, stored);
    await evict();
    return true;
  } catch {
    return false;
  }
}

/** Warm the first one or two clips of a playlist (respecting data saver / size caps). */
export async function warmReelMedia(videos) {
  if (!canPrefetchVideos()) return;
  const urls = (videos || [])
    .map((video) => String(video?.videoUrl || '').trim())
    .filter(Boolean)
    .slice(0, MEDIA_KEEP);
  if (!urls.length) return;
  const cellular = isCellular();
  const targets = cellular ? urls.slice(0, 1) : urls;
  const maxBytes = cellular ? MEDIA_MAX_BYTES_CELLULAR : MEDIA_MAX_BYTES;
  for (const url of targets) {
    // Sequential on purpose: never compete with the page for bandwidth.
    await cacheReelMedia(url, { keep: urls, maxBytes });
  }
}

function collectReelsAssetUrls(html, baseHref) {
  const urls = new Set();
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const parsed = new URL(match[1], baseHref);
      if (parsed.origin !== window.location.origin) continue;
      if (!/\.(js|css)$/i.test(parsed.pathname)) continue;
      urls.add(parsed.href);
    } catch {
      /* ignore */
    }
  }
  return [...urls];
}

export async function prefetchReelsShellAndFeed() {
  const htmlUrl = new URL('/reels.html', window.location.origin).href;
  try {
    const response = await fetch(htmlUrl, { credentials: 'same-origin' });
    if (response.ok) {
      const html = await response.text();
      await Promise.all(
        collectReelsAssetUrls(html, htmlUrl).map((href) =>
          fetch(href, { credentials: 'same-origin' }).catch(() => {})
        )
      );
    }
  } catch {
    /* shell still loads from network */
  }

  try {
    const fresh = await getJumpVideos(PLAYLIST_LIMIT);
    // getJumpVideos() returns bare rows; keep the like/comment counts and
    // avatars the Reels page stored last time so the instant paint isn't "0".
    const prevById = Object.fromEntries(readCachedReelsPlaylist().map((v) => [v.id, v]));
    const videos = fresh.map((video) => {
      const prev = prevById[String(video.id)];
      if (!prev) return video;
      return {
        ...video,
        avatarUrl: video.avatarUrl || prev.avatarUrl,
        likeCount: video.likeCount ?? prev.likeCount,
        commentCount: video.commentCount ?? prev.commentCount,
        liked: video.liked ?? prev.liked,
        saved: video.saved ?? prev.saved,
        displayName: video.displayName && video.displayName !== 'משתמש' ? video.displayName : prev.displayName || video.displayName,
      };
    });
    writeCachedReelsPlaylist(videos);
    await warmReelMedia(videos);
  } catch {
    /* keep last cached playlist */
  }
}
