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

function canPrefetchVideos() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  const type = String(conn.effectiveType || '').toLowerCase();
  return type !== 'slow-2g' && type !== '2g';
}

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

export async function cacheReelMedia(src) {
  const url = String(src || '').trim();
  if (!url) return false;
  const cache = await openMediaCache();
  if (!cache) return false;
  try {
    const existing = await cache.match(url);
    if (existing && existing.ok) return true;
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) return false;
    const blob = await response.blob();
    if (!blob.size) return false;
    const stored = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'video/mp4',
        'Content-Length': String(blob.size),
      },
    });
    await cache.put(url, stored);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((request) => request.url !== url)
        .map((request) => cache.delete(request))
    );
    return true;
  } catch {
    return false;
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
    const videos = await getJumpVideos(PLAYLIST_LIMIT);
    writeCachedReelsPlaylist(videos);
    if (!canPrefetchVideos()) return;
    const firstUrl = videos[0]?.videoUrl;
    if (firstUrl) await cacheReelMedia(firstUrl);
  } catch {
    /* keep last cached playlist */
  }
}
