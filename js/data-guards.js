/**
 * Pure, DOM-free guards shared by the data layer. Each one exists because of a
 * real bug class (see docs/LESSONS.md). Covered by tests/data-guards.test.js.
 */

const GENERIC_NAMES = new Set(['', 'משתמש', 'user', 'User']);
const GENERIC_SPOT_NAMES = new Set(['', 'ספוט', 'spot']);

/** Ids (and aliases) of every spot in a list. */
export function spotIdSet(spots) {
  const ids = new Set();
  (spots || []).forEach((s) => {
    if (!s) return;
    if (s.id != null) ids.add(String(s.id));
    (Array.isArray(s.aliases) ? s.aliases : []).forEach((a) => ids.add(String(a)));
  });
  return ids;
}

/**
 * Spot ids that exist but must be hidden from this viewer (e.g. admin-only
 * spots). Anything NOT in this set is shown: free-text "custom:" tags, aliases,
 * deleted or not-yet-loaded spots. Deny-list instead of allow-list, so an
 * unknown reference can never make content vanish.
 */
export function hiddenSpotIdSet(allSpots, visibleSpots) {
  const visible = spotIdSet(visibleSpots);
  const hidden = new Set();
  spotIdSet(allSpots).forEach((id) => {
    if (!visible.has(id)) hidden.add(id);
  });
  return hidden;
}

/** True when an item tagged with spotId may be shown. */
export function isVisibleSpotRef(spotId, hiddenIds) {
  const sid = String(spotId ?? '').trim();
  if (!sid) return true;
  return !(hiddenIds && hiddenIds.has(sid));
}

export function filterBySpotVisibility(items, hiddenIds, key = 'spotId') {
  return (items || []).filter((item) => item && isVisibleSpotRef(item[key], hiddenIds));
}

function clean(v) {
  return String(v ?? '').trim();
}

/** Live profile name first, then the copy stored on the row, then a fallback. */
export function liveDisplayName(profile, stored, fallback = 'משתמש') {
  const live = clean(profile?.display_name ?? profile?.displayName);
  if (live && !GENERIC_NAMES.has(live)) return live;
  const copy = clean(stored);
  if (copy && !GENERIC_NAMES.has(copy)) return copy;
  return live || copy || fallback;
}

/** Live spot name (by id or alias) first, then the stored copy / custom tag. */
export function findSpotByRef(spots, spotId) {
  const sid = clean(spotId);
  if (!sid) return null;
  return (
    (spots || []).find((s) => s && (String(s.id) === sid
      || (Array.isArray(s.aliases) && s.aliases.map(String).includes(sid)))) || null
  );
}

export function liveSpotName(spots, spotId, stored, fallback = 'ספוט') {
  const live = clean(findSpotByRef(spots, spotId)?.name);
  if (live) return live;
  const copy = clean(stored);
  if (copy && !GENERIC_SPOT_NAMES.has(copy)) return copy;
  const sid = clean(spotId);
  if (sid.startsWith('custom:') && sid.length > 7) return sid.slice(7);
  return copy || fallback;
}

/** Overwrite displayName on each item from a userId -> profile map. */
export function applyLiveNames(items, profilesById, { idKey = 'userId', nameKey = 'displayName' } = {}) {
  return (items || []).map((item) => {
    if (!item) return item;
    const profile = profilesById?.[item[idKey]];
    return { ...item, [nameKey]: liveDisplayName(profile, item[nameKey]) };
  });
}

// ─── Video upload validation ───

export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2'];
const EXT_MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime',
  hevc: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp', '3gpp': 'video/3gpp', '3g2': 'video/3gpp2',
};
const MIME_ALIASES = {
  'video/x-m4v': 'video/mp4', 'video/m4v': 'video/mp4', 'video/hevc': 'video/quicktime',
  'video/h265': 'video/quicktime', 'video/x-quicktime': 'video/quicktime', 'video/mov': 'video/quicktime',
};

export const VIDEO_ERR = {
  tooBig: (mb) => `הסרטון גדול מדי (${mb}MB). אפשר להעלות עד 40MB — קצרו אותו בעורך או צלמו באיכות נמוכה יותר ונסו שוב.`,
  badType: 'סוג הקובץ לא נתמך. אפשר להעלות MP4, MOV (כולל HEVC מאייפון), WebM או 3GP.',
  empty: 'הקובץ ריק או פגום. בחרו סרטון אחר.',
  network: 'החיבור לאינטרנט נקטע בזמן ההעלאה. בדקו את החיבור ונסו שוב.',
  forbidden: 'אין הרשאה להעלות — ייתכן שהחשבון עדיין ממתין לאישור, או שצריך להתחבר מחדש.',
  auth: 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.',
  server: 'השרת לא הצליח לשמור את הסרטון כרגע. נסו שוב בעוד דקה.',
  generic: 'העלאת הסרטון נכשלה',
};

/** Base MIME the storage bucket accepts, or '' when not allowed. */
export function videoContentType(file) {
  let base = String(file?.type || '').split(';')[0].trim().toLowerCase();
  base = MIME_ALIASES[base] || base;
  if (!base || base === 'application/octet-stream' || !ALLOWED_VIDEO_MIME.includes(base)) {
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    const byExt = EXT_MIME[ext] || '';
    if (byExt) base = byExt;
  }
  return ALLOWED_VIDEO_MIME.includes(base) ? base : '';
}

/** Client-side check before any byte is uploaded. */
export function validateVideoFile(file, maxBytes = MAX_VIDEO_BYTES) {
  if (!file) return { ok: false, error: 'נא לבחור סרטון' };
  const type = videoContentType(file);
  if (!type) return { ok: false, error: VIDEO_ERR.badType };
  if (!file.size) return { ok: false, error: VIDEO_ERR.empty };
  if (file.size > maxBytes) {
    return { ok: false, error: VIDEO_ERR.tooBig(Math.ceil(file.size / (1024 * 1024))) };
  }
  return { ok: true, type };
}

/** Map any storage/XHR/Supabase upload error to a clear Hebrew reason. */
export function uploadErrorMessage(err, size = 0) {
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const raw = `${err?.message || ''} ${err?.error || ''} ${err?.responseText || ''}`.toLowerCase();
  if (err?.network || /failed to fetch|networkerror|network request failed|load failed|timeout/.test(raw)) {
    return VIDEO_ERR.network;
  }
  if (status === 413 || /payload too large|maximum allowed size|entitytoolarge|too large/.test(raw)) {
    return VIDEO_ERR.tooBig(Math.ceil((size || 0) / (1024 * 1024)) || '40+');
  }
  if (status === 415 || /mime|content type|invalid_mime_type/.test(raw)) return VIDEO_ERR.badType;
  if (/jwt|expired|invalid token/.test(raw)) return VIDEO_ERR.auth;
  if (status === 401 || status === 403 || /row-level security|permission denied|unauthorized|42501|not approved/.test(raw)) {
    return VIDEO_ERR.forbidden;
  }
  if (status >= 500) return VIDEO_ERR.server;
  return VIDEO_ERR.generic;
}

/** True when this browser cannot decode the given video URL's container. */
export function cannotPlayVideoUrl(url, canPlayType) {
  if (typeof canPlayType !== 'function') return false;
  const ext = String(url || '').split('?')[0].split('.').pop().toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) return false;
  return canPlayType(mime) === '';
}

/**
 * Max output size for re-encoded reels. A 4K (2160x3840) VP9 WebM made by the
 * clip editor failed to decode in WebKit (MEDIA_ERR_SRC_NOT_SUPPORTED).
 */
export const MAX_RECORD_LONG_SIDE = 1920;

/** Scale (w,h) down to fit within maxLong on the long side; never upscales; even dims. */
export function fitWithin(w, h, maxLong = MAX_RECORD_LONG_SIDE) {
  const W = Math.max(16, Math.round(Number(w) || 720));
  const H = Math.max(16, Math.round(Number(h) || 1280));
  const scale = Math.min(1, maxLong / Math.max(W, H));
  const even = (n) => Math.max(16, Math.round(n * scale / 2) * 2);
  return { width: scale < 1 ? even(W) : W, height: scale < 1 ? even(H) : H, scaled: scale < 1 };
}

/** Pick the right user-facing reason for a <video> error. */
export function videoErrorKind(errorCode, url, canPlayType) {
  // Missing seed /videos/ assets 404 as code 4 — that is not a codec problem.
  if (isUnshippedLocalVideo(url)) return 'error';
  if (Number(errorCode) === 4 || cannotPlayVideoUrl(url, canPlayType)) return 'unsupported';
  return 'error';
}

/**
 * Reload decision for the stale-JS guard: only when the server runs a different
 * real version and we haven't already reloaded for it (no reload loops).
 */
export function shouldReloadForVersion(running, server, alreadyReloadedFor) {
  const r = String(running || '').trim();
  const s = String(server || '').trim();
  if (!r || !s || r === 'dev' || r === s) return false;
  return alreadyReloadedFor !== s;
}

/**
 * WebM with the Matroska AlphaMode flag set (EBML id 0x53C0, value 1) does not
 * decode in WebKit/iOS (MEDIA_ERR_SRC_NOT_SUPPORTED). Chrome's MediaRecorder sets
 * it for canvas-sourced VP9. Flip the value byte 1 -> 0 in the track header
 * (same length, file stays valid; the video has no real transparency).
 * Returns the number of flags cleared. Mutates `bytes` (Uint8Array).
 */
export function clearWebmAlphaFlag(bytes, scanLimit = 256 * 1024) {
  let cleared = 0;
  const end = Math.min(bytes?.length || 0, scanLimit) - 3;
  for (let i = 0; i < end; i += 1) {
    if (bytes[i] === 0x53 && bytes[i + 1] === 0xc0 && bytes[i + 2] === 0x81 && bytes[i + 3] === 0x01) {
      bytes[i + 3] = 0x00;
      cleared += 1;
    }
  }
  return cleared;
}

/**
 * Seed spot clips live under `/videos/...` in the repo, but `public/videos/` is
 * gitignored and never uploaded to the Worker. A missing file makes Safari fire
 * MEDIA_ERR_SRC_NOT_SUPPORTED (code 4), which we used to label as "format or
 * resolution". Relative `/videos/` paths (and same-path absolute URLs) are not
 * playable until those assets are actually hosted.
 */
export function isUnshippedLocalVideo(src) {
  const raw = String(src || '').trim();
  if (!raw) return false;
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname || '';
    } catch {
      return false;
    }
  }
  return /^\/videos\//i.test(path);
}

/** True when the URL looks like a WebM we can attempt AlphaMode repair on. */
export function isWebmUrl(src) {
  const path = String(src || '').split('?')[0].split('#')[0];
  return /\.webm$/i.test(path);
}

/**
 * Copy `bytes` and clear AlphaMode if present. Returns the repaired copy, or
 * null when nothing needed changing (caller should not swap the source).
 */
export function repairedWebmBytes(bytes, scanLimit = 256 * 1024) {
  if (!bytes || !bytes.length) return null;
  const copy = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  return clearWebmAlphaFlag(copy, scanLimit) > 0 ? copy : null;
}

/** Recorder output order: MP4 (plays everywhere incl. iOS) before WebM. */
export const RECORDER_MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,vorbis',
  'video/webm',
];

/**
 * Auth signup result classification (email confirm + anti-enumeration).
 * Supabase with Confirm email ON returns session=null for a real new user.
 * For an email that already exists it often returns a user with identities=[]
 * and no error (anti-enumeration) — that must NOT be treated as "check your
 * inbox", or the UI flips to login and a later sign-in shows wrong-password.
 */
export function isAlreadyRegisteredAuthError(err) {
  const code = String(err?.code || err?.error_code || '').toLowerCase();
  const msg = String(err?.message || err?.msg || err?.error_description || '').toLowerCase();
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    code === 'user_already_registered'
  ) {
    return true;
  }
  return (
    msg.includes('user already registered') ||
    msg.includes('already been registered') ||
    msg.includes('email address already') ||
    msg.includes('email already registered') ||
    msg.includes('user_already_exists') ||
    msg.includes('email_exists')
  );
}

/**
 * @param {{ user?: { identities?: unknown[] } | null, session?: unknown } | null | undefined} data
 * @returns {'session' | 'confirm_email' | 'already_registered' | 'empty'}
 */
export function classifySignUpResult(data) {
  if (!data || typeof data !== 'object') return 'empty';
  if (data.session) return 'session';
  const identities = data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) return 'already_registered';
  if (data.user) return 'confirm_email';
  return 'empty';
}
