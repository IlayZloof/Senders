import { createClient } from '@supabase/supabase-js';
import seedSpots from '../data/seed-spots.json';
import deletedSpotIdsSeed from '../data/deleted-spots.json';
import { normalizeRocks, RETIRED_MEDIA_SRCS } from './spots-util.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAILS = (
  import.meta.env.VITE_ADMIN_EMAIL || 'ilay@sendit.co.il,ilay.zloof@gmail.com'
)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}

export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

const CLOUD_DOWN_KEY = 'sendit_cloud_down';
/**
 * A single failed fetch (flaky mobile network, request aborted by navigation,
 * Safari "Load failed") used to flip the whole tab into offline/local mode
 * forever: getSession() then ignored the real Supabase login and every gated
 * page bounced to login. The flag now expires quickly and is cleared as soon as
 * Supabase answers again.
 */
const CLOUD_DOWN_TTL_MS = 30_000;

function markCloudUnreachable() {
  try {
    sessionStorage.setItem(CLOUD_DOWN_KEY, String(Date.now()));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearCloudUnreachable() {
  try {
    sessionStorage.removeItem(CLOUD_DOWN_KEY);
  } catch {
    /* ignore */
  }
}

function isCloudUnreachable() {
  try {
    const raw = sessionStorage.getItem(CLOUD_DOWN_KEY);
    if (!raw) return false;
    const at = Number(raw);
    // Legacy value '1' (no timestamp) or expired -> treat as reachable again.
    if (!Number.isFinite(at) || at < 1e12 || Date.now() - at > CLOUD_DOWN_TTL_MS) {
      sessionStorage.removeItem(CLOUD_DOWN_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function useCloud() {
  return Boolean(supabase) && !isCloudUnreachable();
}

function isNetworkFetchError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || err.error_description || err.details || '').toLowerCase();
  const causeMsg = String(err.cause?.message || '').toLowerCase();
  if (name === 'AuthRetryableFetchError') return true;
  if (err.status === 0) return true;
  if (name === 'TypeError' && (msg.includes('fetch') || msg.includes('network'))) return true;
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_connection') ||
    causeMsg.includes('failed to fetch')
  );
}

const LS_SPOTS = 'sendit_spots';
const LS_PENDING = 'sendit_pending_spots';
const LS_NOTIFICATIONS = 'sendit_admin_notifications';
const LS_EXPERIENCES = 'sendit_experiences';
const LS_JUMPS = 'sendit_jumps';
const LS_USERS = 'sendit_users';
const LS_SESSION = 'sendit_session';
const LS_INVITATIONS = 'sendit_invitations';
const LS_AUDIT_LOG = 'sendit_audit_log';
const LS_FAVORITES = 'sendit_favorites';
const LS_SPOT_POSTS = 'sendit_spot_posts';
const LS_MEETUPS = 'sendit_meetups';
const LS_DELETED_SPOTS = 'sendit_deleted_spots';
const LS_DELETED_MEETUPS = 'sendit_deleted_meetups';
const LS_AVATARS = 'sendit_profile_avatars';
const LS_BIOS = 'sendit_profile_bios';
const PROFILE_BIO_MAX = 160;
const PROFILE_NAME_MAX = 40;

function read(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    const quota = err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
    if (quota) {
      throw new Error('אין מספיק מקום במכשיר. נסו בלי תמונה או תמונה קטנה יותר.');
    }
    throw err;
  }
}

function uid() {
  return crypto.randomUUID();
}

export function isSupabaseMode() {
  return hasSupabase;
}

export function getAdminEmail() {
  return ADMIN_EMAILS[0] || '';
}

export function getAdminEmails() {
  return [...ADMIN_EMAILS];
}

function profileEmail(profile, authUser) {
  return (profile?.email || authUser?.email || '').toLowerCase();
}

function shouldBeAdmin(profile, authUser) {
  return profile?.is_admin === true || isAdminEmail(profileEmail(profile, authUser));
}

export function isAdmin(profile, authUser) {
  if (!profile) return false;
  return shouldBeAdmin(profile, authUser);
}

export function newAccountStatus(email) {
  return isAdminEmail(email) ? 'active' : 'disabled';
}

export function hasApprovedAccess(profile, authUser) {
  // No profile = signed out. This used to fall through to the 'active'
  // default, so signed-out visitors on login.html got the app tab bar.
  if (!profile) return false;
  if (isAdmin(profile, authUser)) return true;
  return (profile?.status || 'active') === 'active';
}

export function isWaitingAccess(profile, authUser) {
  if (!profile) return false;
  if (isAdmin(profile, authUser)) return false;
  return profile.status === 'disabled' || profile.status === 'pending';
}

export async function canUseSite() {
  try {
    const session = await getSession();
    return Boolean(session && hasApprovedAccess(session.profile, session.user));
  } catch {
    return false;
  }
}

function syncLocalAdminFlags(users) {
  let changed = false;
  for (const user of users) {
    if (isAdminEmail(user.email) && !user.is_admin) {
      user.is_admin = true;
      changed = true;
    }
    if (!user.status) {
      user.status = 'active';
      changed = true;
    }
  }
  if (changed) write(LS_USERS, users);
  return changed;
}

function ensureLocalInvitations() {
  const invitations = read(LS_INVITATIONS, []);
  const missingAdminInvites = ADMIN_EMAILS.filter(
    (adminEmail) => !invitations.some((i) => (i.email || '').toLowerCase() === adminEmail)
  );
  for (const adminEmail of missingAdminInvites) {
    invitations.push({
      id: uid(),
      email: adminEmail,
      invited_by: null,
      used_at: null,
      created_at: new Date().toISOString(),
    });
  }
  if (missingAdminInvites.length) write(LS_INVITATIONS, invitations);
  return read(LS_INVITATIONS, []);
}

export async function isEmailInvited(email) {
  const normalized = (email || '').toLowerCase();
  if (!normalized) return false;
  if (isAdminEmail(normalized)) return true;

  if (useCloud()) {
    const { data, error } = await supabase.rpc('check_invitation', {
      invite_email: normalized,
    });
    if (error) throw error;
    return Boolean(data);
  }

  ensureLocalInvitations();
  return read(LS_INVITATIONS, []).some(
    (i) => (i.email || '').toLowerCase() === normalized && !i.used_at
  );
}

function markInvitationUsedLocal(email) {
  const normalized = (email || '').toLowerCase();
  const invitations = read(LS_INVITATIONS, []);
  let changed = false;
  for (const invite of invitations) {
    if ((invite.email || '').toLowerCase() === normalized && !invite.used_at) {
      invite.used_at = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) write(LS_INVITATIONS, invitations);
}

async function touchLastLogin(userId) {
  invalidateSessionCache();
  const now = new Date().toISOString();
  if (useCloud()) {
    await supabase.from('profiles').update({ last_login_at: now }).eq('id', userId);
    return;
  }
  const users = read(LS_USERS);
  const user = users.find((u) => u.id === userId);
  if (user) {
    user.last_login_at = now;
    write(LS_USERS, users);
  }
}

async function logAudit(action, targetUserId, details = '') {
  const session = await getSession();
  if (!session || !isAdmin(session.profile, session.user)) return;

  const entry = {
    id: uid(),
    admin_user_id: session.profile.id || session.user.id,
    action,
    target_user_id: targetUserId || null,
    details,
    created_at: new Date().toISOString(),
  };

  if (useCloud()) {
    await supabase.from('audit_log').insert(entry);
    return;
  }

  const log = read(LS_AUDIT_LOG, []);
  log.unshift(entry);
  write(LS_AUDIT_LOG, log.slice(0, 200));
}

function authDisplayName(authUser, fallback) {
  const meta = authUser?.user_metadata || {};
  return (
    fallback ||
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (authUser?.email ? authUser.email.split('@')[0] : '') ||
    'משתמש'
  );
}

async function ensureProfileForAuthUser(authUser, displayName) {
  let profile = await getProfile(authUser.id);
  const email = profileEmail(profile, authUser);

  if (!profile) {
    // The database decides is_admin/status (new non-admin accounts start
    // 'disabled' until an admin approves them — migration 020). We only send
    // the basic fields and read back what the DB actually stored.
    const newProfile = {
      id: authUser.id,
      display_name: authDisplayName(authUser, displayName),
      email,
      created_at: authUser.created_at || new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();
    if (error) throw error;
    profile = data || {
      ...newProfile,
      is_admin: isAdminEmail(email),
      status: newAccountStatus(email),
    };
  }

  return profile;
}

// ─── Auth ───

function getLocalSession() {
  const session = read(LS_SESSION, null);
  if (!session) return null;
  const users = read(LS_USERS);
  syncLocalAdminFlags(users);
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { user, profile: withCachedAvatar(user) };
}

function authSessionUsable(session) {
  return Boolean(session?.user?.id && session?.access_token);
}

function authSessionExpired(session) {
  const exp = Number(session?.expires_at || 0);
  if (!exp) return false;
  return exp * 1000 <= Date.now() + 20_000;
}

/** Same live JWT the rest of the app should use — refresh once if missing/expired. */
async function readSupabaseAuthSession() {
  if (!supabase) return null;

  let session = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isNetworkFetchError(error)) throw error;
    session = data?.session || null;
  } catch (err) {
    if (isNetworkFetchError(err)) throw err;
  }

  if (authSessionUsable(session) && !authSessionExpired(session)) {
    return session;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && authSessionUsable(data?.session)) return data.session;
  } catch (err) {
    if (isNetworkFetchError(err)) throw err;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isNetworkFetchError(error)) throw error;
    if (authSessionUsable(data?.session)) return data.session;
  } catch (err) {
    if (isNetworkFetchError(err)) throw err;
  }

  return null;
}

function sessionFromAuth(authSession, profile) {
  const authUser = authSession.user;
  const email = profileEmail(profile, authUser);
  return {
    user: authUser,
    accessToken: authSession.access_token,
    profile: profile
      ? { ...profile, email: profile.email || authUser.email }
      : {
          id: authUser.id,
          display_name: authUser.user_metadata?.display_name || 'משתמש',
          email: authUser.email,
          is_admin: isAdminEmail(email),
          status: newAccountStatus(email),
          created_at: authUser.created_at,
        },
  };
}

/**
 * getSession() is called several times per page load (nav gate, page script,
 * canUseSite() inside every data loader, admin checks…). Each call used to hit
 * Supabase for the profile row, so a single page made 3–5 sequential profile
 * round-trips before showing anything. Share one in-flight/just-resolved
 * result for a few seconds; any auth change or profile write invalidates it.
 */
const SESSION_MEMO_TTL_MS = 4000;
let sessionMemo = null; // { promise, at }

export function invalidateSessionCache() {
  sessionMemo = null;
}

if (supabase) {
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event !== 'INITIAL_SESSION') invalidateSessionCache();
    });
  } catch {
    /* ignore */
  }
}

export function getSession() {
  const now = Date.now();
  if (sessionMemo && now - sessionMemo.at < SESSION_MEMO_TTL_MS) {
    return sessionMemo.promise;
  }
  const promise = getSessionUncached();
  const memo = { promise, at: now };
  sessionMemo = memo;
  promise.then(
    () => {
      if (sessionMemo === memo) memo.at = Date.now();
    },
    () => {
      if (sessionMemo === memo) sessionMemo = null;
    }
  );
  return promise;
}

async function getSessionUncached() {
  if (useCloud()) {
    try {
      const authSession = await readSupabaseAuthSession();
      if (authSessionUsable(authSession)) {
        const authUser = authSession.user;
        let profile = await ensureProfileForAuthUser(authUser);

        const email = profileEmail(profile, authUser);
        const needsAdmin = isAdminEmail(email) && !profile?.is_admin;
        const needsEmail = profile && !profile.email && authUser.email;

        if (needsAdmin || needsEmail) {
          const patch = {};
          if (needsAdmin) patch.is_admin = true;
          if (needsEmail) patch.email = authUser.email;
          await supabase.from('profiles').update(patch).eq('id', authUser.id);
          profile = { ...profile, ...patch };
        }

        clearCloudUnreachable();
        return sessionFromAuth(authSession, profile);
      }
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }

  // Local guest profile must not look like a Supabase login while cloud is live
  // (nav avatar vs publish JWT). Only use it offline / without Supabase.
  if (!hasSupabase || isCloudUnreachable()) {
    return getLocalSession();
  }
  return null;
}

const AUTH_REDIRECT_KEY = 'senders_auth_redirect';

function isSafeAppPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return false;
  if (raw.startsWith('//') || raw.includes('://') || raw.includes('..')) return false;
  // Backslashes / control chars can be normalised by browsers into //host
  if (/[\\\u0000-\u001f]/.test(raw)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false; // javascript:, data:, etc.
  return true;
}

/** Pages that must never be used as a post-login redirect target (prevents login loops). */
const AUTH_PAGES = new Set(['login.html', 'waiting.html']);

/** Normalised page file name ("login", "/login.html?x" -> "login.html"). */
export function pageFileOf(path) {
  const raw = String(path || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  let file = (raw.split('/').pop() || '').toLowerCase();
  if (!file || file === 'index' || file === 'index.html') return 'index.html';
  if (!file.endsWith('.html')) file = `${file}.html`;
  return file;
}

export function isAuthPagePath(path) {
  return AUTH_PAGES.has(pageFileOf(path));
}

function withHtmlPage(path) {
  const raw = String(path || '').trim().replace(/^\/+/, '');
  if (raw === 'edit-profile' || raw.startsWith('edit-profile?') || raw.startsWith('edit-profile#')) {
    return raw.replace(/^edit-profile/, 'edit-profile.html');
  }
  return raw;
}

/**
 * Returns a safe same-origin relative path (no leading slash), or `fallback`.
 * Rejects absolute/cross-origin URLs, protocol-relative paths, and the
 * login/waiting pages themselves (a redirect back to login is what caused loops).
 */
export function safeAppPath(path, fallback = 'index.html') {
  const raw = String(path || '').trim();
  if (!raw) return fallback;
  let next;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin !== window.location.origin) return fallback;
      next = withHtmlPage(`${url.pathname}${url.search}${url.hash}`);
    } catch {
      return fallback;
    }
  } else {
    if (raw.startsWith('//')) return fallback;
    next = withHtmlPage(raw);
  }
  if (!isSafeAppPath(next)) return fallback;
  if (isAuthPagePath(next)) return fallback;
  return next;
}

/**
 * Build the login URL exactly once. `next` defaults to the current page
 * (pathname + search only, never hash/origin). If the current page is already
 * login/waiting, no redirect param is added, so URLs can never nest.
 */
export function buildLoginUrl(next) {
  const target = next == null
    ? `${window.location.pathname}${window.location.search}`
    : String(next);
  const safe = safeAppPath(target, '');
  if (!safe || safe === 'index.html') return '/login.html';
  return `/login.html?${new URLSearchParams({ redirect: safe })}`;
}

export function rememberAuthRedirect(path) {
  try {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, safeAppPath(path, 'index.html'));
  } catch {
    /* private mode */
  }
}

export function consumeAuthRedirect(fallback = 'index.html') {
  try {
    const stored = sessionStorage.getItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    if (stored) return safeAppPath(stored, fallback);
  } catch {
    /* private mode */
  }
  return safeAppPath(fallback, 'index.html');
}

/** Canonical OAuth callback — no query string, so Supabase allow-list matches. */
export function authCallbackUrl() {
  return `${window.location.origin}/login.html`;
}

export async function signInWithGoogle(redirectPath = 'index.html') {
  if (!supabase) {
    throw new Error('התחברות עם Google דורשת חיבור ל-Supabase');
  }

  rememberAuthRedirect(redirectPath);
  const redirectTo = authCallbackUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

function signUpLocal(normalizedEmail, password, displayName) {
  const isAdminUser = isAdminEmail(normalizedEmail);
  const users = read(LS_USERS);
  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error('כתובת האימייל כבר רשומה');
  }

  const user = {
    id: uid(),
    email: normalizedEmail,
    display_name: displayName,
    password,
    is_admin: isAdminUser,
    status: newAccountStatus(normalizedEmail),
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };
  users.push(user);
  write(LS_USERS, users);
  markInvitationUsedLocal(normalizedEmail);
  write(LS_SESSION, { userId: user.id });
  return { user, session: { userId: user.id } };
}

function signInLocal(normalizedEmail, password, { fromCloudFallback = false } = {}) {
  const users = read(LS_USERS);
  const user = users.find((u) => u.email === normalizedEmail && u.password === password);
  if (!user) {
    if (fromCloudFallback) {
      throw new Error('לא מצליחים להתחבר לשרת. נסו שוב או הירשמו במצב מקומי');
    }
    throw new Error('אימייל או סיסמה שגויים');
  }
  if (isAdminEmail(normalizedEmail)) user.is_admin = true;
  user.last_login_at = new Date().toISOString();
  write(LS_USERS, users);
  write(LS_SESSION, { userId: user.id });
  return { user };
}

export async function signUp(email, password, displayName) {
  invalidateSessionCache();
  const normalizedEmail = email.toLowerCase();

  if (useCloud()) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) {
        if (isNetworkFetchError(error)) {
          markCloudUnreachable();
          return signUpLocal(normalizedEmail, password, displayName);
        }
        throw error;
      }
      if (data.user) {
        // is_admin/status are set by the database (migration 020), not the client.
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: displayName,
          email: normalizedEmail,
        });
        if (!profileErr && data.session) {
          await touchLastLogin(data.user.id);
        }
      }
      return data;
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
      return signUpLocal(normalizedEmail, password, displayName);
    }
  }

  return signUpLocal(normalizedEmail, password, displayName);
}

export async function signIn(email, password) {
  invalidateSessionCache();
  const normalizedEmail = email.toLowerCase();
  const isAdminUser = isAdminEmail(normalizedEmail);

  if (useCloud()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (isNetworkFetchError(error)) {
          markCloudUnreachable();
          return signInLocal(normalizedEmail, password, { fromCloudFallback: true });
        }
        throw error;
      }
      if (data.user) {
        const profile = await getProfile(data.user.id);

        if (isAdminUser) {
          await supabase
            .from('profiles')
            .update({ is_admin: true, email: normalizedEmail })
            .eq('id', data.user.id);
        }
        await touchLastLogin(data.user.id);
      }
      return data;
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
      return signInLocal(normalizedEmail, password, { fromCloudFallback: true });
    }
  }

  return signInLocal(normalizedEmail, password);
}

export async function signOut() {
  invalidateSessionCache();
  if (useCloud()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }
  localStorage.removeItem(LS_SESSION);
  invalidateSessionCache();
}

export async function requestPasswordReset(email) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) throw new Error('נא להזין אימייל');

  if (useCloud()) {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login.html`,
    });
    if (error) throw error;
    return { sent: true };
  }

  return { local: true };
}

export async function updatePassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error('הסיסמה חייבת להכיל לפחות 6 תווים');
  }

  if (useCloud()) {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  throw new Error('עדכון סיסמה דרך קישור זמין רק במצב Supabase');
}

export async function resetLocalPassword(email, newPassword) {
  if (useCloud()) {
    throw new Error('במצב Supabase יש לאפס סיסמה דרך האימייל');
  }

  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) throw new Error('נא להזין אימייל');
  if (!newPassword || String(newPassword).length < 6) {
    throw new Error('הסיסמה חייבת להכיל לפחות 6 תווים');
  }

  const users = read(LS_USERS);
  const user = users.find((u) => u.email === normalizedEmail);
  if (user) {
    user.password = newPassword;
    write(LS_USERS, users);
  }

  return { updated: Boolean(user) };
}

function readAvatarCache() {
  const map = read(LS_AVATARS, {});
  return map && typeof map === 'object' ? map : {};
}

function cachedAvatarUrl(userId) {
  if (!userId) return '';
  return String(readAvatarCache()[userId] || '');
}

function writeAvatarCache(userId, url) {
  if (!userId) return;
  const map = readAvatarCache();
  if (url) map[userId] = url;
  else delete map[userId];
  write(LS_AVATARS, map);
}

function cachedBio(userId) {
  if (!userId) return '';
  const map = read(LS_BIOS, {});
  return String(map?.[userId] || '');
}

function writeBioCache(userId, bio) {
  if (!userId) return;
  const map = read(LS_BIOS, {});
  const text = String(bio || '').trim().slice(0, PROFILE_BIO_MAX);
  if (text) map[userId] = text;
  else delete map[userId];
  write(LS_BIOS, map);
}

function withCachedAvatar(profile) {
  if (!profile) return profile;
  const fromRow = profilePhotoFromRow(profile);
  const cached = cachedAvatarUrl(profile.id);
  const bio = String(profile.bio || '').trim() || cachedBio(profile.id);
  if (cached || fromRow || bio) {
    return {
      ...profile,
      avatar_url: cached || fromRow,
      ...(bio ? { bio } : {}),
    };
  }
  return profile;
}

export async function getProfile(userId) {
  if (useCloud()) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return withCachedAvatar(data);
  }
  const users = read(LS_USERS);
  return withCachedAvatar(users.find((u) => u.id === userId) || null);
}

export async function updateProfileAvatar(dataUrl) {
  const session = await getSession();
  const userId = session?.user?.id || session?.profile?.id;
  if (!userId) throw new Error('צריך להתחבר כדי לעדכן תמונת פרופיל');
  const avatarUrl = String(dataUrl || '').trim();
  const clearing = !avatarUrl;
  if (!clearing && !avatarUrl.startsWith('data:image/')) {
    throw new Error('נא לבחור קובץ תמונה');
  }

  writeAvatarCache(userId, clearing ? '' : avatarUrl);

  const users = read(LS_USERS);
  const local = users.find((u) => u.id === userId);
  if (local) {
    local.avatar_url = clearing ? '' : avatarUrl;
    if (clearing) {
      delete local.avatar;
      delete local.photo;
      delete local.image;
    }
    write(LS_USERS, users);
  }

  if (useCloud() && supabase) {
    const payload = { avatar_url: clearing ? null : avatarUrl };
    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || (clearing ? 'לא הצלחנו להסיר את התמונה' : 'לא הצלחנו לשמור את התמונה'));
    }
    try {
      await supabase.auth.updateUser({ data: { avatar_url: clearing ? '' : avatarUrl } });
    } catch {
      /* metadata is a fallback; local + profiles row are enough */
    }
  }

  invalidateSessionCache();
  return { avatar_url: clearing ? '' : avatarUrl };
}

export async function clearProfileAvatar() {
  return updateProfileAvatar('');
}

export async function updateProfile({ displayName, bio } = {}) {
  const session = await getSession();
  const userId = session?.user?.id || session?.profile?.id;
  if (!userId) throw new Error('צריך להתחבר כדי לערוך פרופיל');

  const name = String(displayName || '').trim();
  if (!name) throw new Error('נא למלא שם תצוגה');
  if (name.length > PROFILE_NAME_MAX) throw new Error('שם התצוגה ארוך מדי');

  const bioText = String(bio || '').trim().slice(0, PROFILE_BIO_MAX);
  writeBioCache(userId, bioText);

  const users = read(LS_USERS);
  const local = users.find((u) => u.id === userId);
  if (local) {
    local.display_name = name;
    local.bio = bioText;
    write(LS_USERS, users);
  }

  if (useCloud() && supabase) {
    const fullPatch = { display_name: name, bio: bioText };
    let { error } = await supabase.from('profiles').update(fullPatch).eq('id', userId);
    if (error && isMissingTableError(error)) {
      ({ error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId));
    }
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || 'לא הצלחנו לשמור את הפרופיל');
    }
    try {
      await supabase.auth.updateUser({ data: { display_name: name } });
    } catch {
      /* metadata is a fallback; local + profiles row are enough */
    }
  }

  invalidateSessionCache();
  return { display_name: name, bio: bioText };
}

// ─── Admin notifications ───

function notifyAdmin({ type, title, body, spotId, userId }) {
  const notifications = read(LS_NOTIFICATIONS);
  notifications.unshift({
    id: uid(),
    type,
    title,
    body,
    spot_id: spotId,
    user_id: userId,
    read: false,
    created_at: new Date().toISOString(),
  });
  write(LS_NOTIFICATIONS, notifications.slice(0, 100));
}

export async function getAdminNotifications() {
  if (useCloud()) {
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        if (isNetworkFetchError(error)) markCloudUnreachable();
        else throw error;
      } else {
        return data || [];
      }
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }
  return read(LS_NOTIFICATIONS);
}

export async function getUnreadNotificationCount() {
  const all = await getAdminNotifications();
  return all.filter((n) => !n.read).length;
}

export async function markNotificationsRead() {
  if (useCloud()) {
    await supabase.from('admin_notifications').update({ read: true }).eq('read', false);
    return;
  }
  const all = read(LS_NOTIFICATIONS).map((n) => ({ ...n, read: true }));
  write(LS_NOTIFICATIONS, all);
}

export async function submitSpotReport({ spotId, spotName, userId, reason, details = '' }) {
  const body = details ? `${reason} — ${details}` : reason;
  const title = `דיווח על ספוט: ${spotName}`;

  if (useCloud()) {
    const { error } = await supabase.from('admin_notifications').insert({
      id: uid(),
      type: 'report',
      title,
      body,
      spot_id: spotId,
      user_id: userId,
      read: false,
    });
    if (error) throw error;
    return;
  }

  notifyAdmin({ type: 'report', title, body, spotId, userId });
}

// ─── Spots ───

function uniqueMediaList(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const value = String(item || '').trim();
      if (!value || seen.has(value) || RETIRED_MEDIA_SRCS.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

const RETIRED_SPOT_IDS = new Set(['rosh-hanikra-ledge', 'banias', 'gilbon']);
const FORCE_SEED_NAME_IDS = new Set([
  'kishon-bridge',
  'rosh-hanikra',
  'ein-ayit',
  'fasael-pool',
  'meshushim',
  'eilat-obs-roof',
  'eilat-observatory',
]);
const FORCE_SEED_IMAGES_IDS = new Set(['saar-fall', 'ein-ayit', 'eilat-obs-roof', 'eilat-observatory', 'ein-gev-pillars']);
const FORCE_SEED_COORDS_IDS = new Set(['eilat-obs-roof', 'eilat-observatory', 'ein-gev-pillars', 'ein-samia']);

function stripUnverifiedFromTitle(name) {
  return String(name || '')
    .replace(/\s*[—–\-·,]?\s*לא אומת\s*$/u, '')
    .replace(/\s+לא אומת\s*$/u, '')
    .trim();
}

/** Strip jump-height suffixes from titles; keep place names like «— נחל ערוגות». */
function stripHeightFromTitle(name) {
  return String(name || '')
    .replace(
      /\s+(?:כ[־\-]?)?\d+(?:[.,]\d+)?(?:\s*[–\-]\s*\d+(?:[.,]\d+)?)?\s*(?:מטרים|מטר|מ׳|מ'|מ\.?|m)\b\.?\s*$/iu,
      ''
    )
    .trim();
}

function persistIdList(key, id) {
  const value = String(id || '');
  if (!value) return;
  const ids = read(key, []).map(String);
  if (!ids.includes(value)) {
    ids.push(value);
    write(key, ids);
  }
}

function deletedSpotIdSet(extraIds = []) {
  return new Set([
    ...RETIRED_SPOT_IDS,
    ...(Array.isArray(deletedSpotIdsSeed) ? deletedSpotIdsSeed : []).map(String),
    ...read(LS_DELETED_SPOTS, []).map(String),
    ...extraIds.map(String),
  ]);
}

function isDeletedSpot(id, extraIds = []) {
  return deletedSpotIdSet(extraIds).has(String(id || ''));
}

function isRetiredSpot(id) {
  return isDeletedSpot(id);
}

function isUnverifiedSpot(spot) {
  return Boolean(spot?.unverified);
}

async function currentViewerIsAdmin() {
  try {
    const session = await getSession();
    return Boolean(session && isAdmin(session.profile, session.user));
  } catch {
    return false;
  }
}

function withoutRetiredSpots(list, extraDeletedIds = []) {
  const deleted = deletedSpotIdSet(extraDeletedIds);
  return (list || []).filter((s) => s && !deleted.has(String(s.id)));
}

function isPubliclyListedSpot(spot) {
  return spot?.listed === true;
}

/** Hidden from guests: unverified and not explicitly listed (unlike meshushim / jordan-pipe-bridge). */
export function isAdminOnlySpot(spot) {
  return isUnverifiedSpot(spot) && !isPubliclyListedSpot(spot);
}

function visibleSpotsForViewer(list, admin) {
  if (admin) return list || [];
  return (list || []).filter((s) => !isUnverifiedSpot(s) || isPubliclyListedSpot(s));
}

function seedRecordForSpot(spot) {
  const id = String(spot?.id || '');
  return (
    seedSpots.find((s) => s.id === id) ||
    seedSpots.find((s) => Array.isArray(s.aliases) && s.aliases.map(String).includes(id)) ||
    null
  );
}

function overlaySeedFields(spot) {
  const seed = seedRecordForSpot(spot);
  if (!seed) return { ...spot, name: stripHeightFromTitle(stripUnverifiedFromTitle(spot?.name)) };
  const forceDraftCopy = seed.id === 'eilat-obs-roof';
  const instagram_url = forceDraftCopy
    ? ''
    : normalizeInstagramUrl(seed.instagram_url || spot.instagram_url || spot.instagram_video);
  const forceSeedImages = FORCE_SEED_IMAGES_IDS.has(seed.id);
  const videos = forceDraftCopy
    ? uniqueMediaList(seed.videos)
    : seed.id === 'ein-ayit'
      ? uniqueMediaList(seed.videos, spot.videos)
      : uniqueMediaList(spot.videos, seed.videos);
  const images = forceDraftCopy
    ? uniqueMediaList(seed.images)
    : forceSeedImages
      ? uniqueMediaList(seed.images, spot.images)
      : uniqueMediaList(spot.images, seed.images);
  return {
    ...seed,
    ...spot,
    id: seed.id,
    image: forceDraftCopy
      ? ''
      : forceSeedImages
      ? (seed.image || (spot.image && !RETIRED_MEDIA_SRCS.has(String(spot.image)) ? spot.image : '') || '')
      : ((spot.image && !RETIRED_MEDIA_SRCS.has(String(spot.image)) ? spot.image : '') || seed.image),
    images: images.length ? images : forceDraftCopy ? [] : spot.images || seed.images,
    videos: videos.length ? videos : forceDraftCopy ? [] : spot.videos || seed.videos,
    instagram_url: forceDraftCopy ? '' : (instagram_url || seed.instagram_url || spot.instagram_url || ''),
    name: stripHeightFromTitle(
      stripUnverifiedFromTitle(
        FORCE_SEED_NAME_IDS.has(seed.id) || FORCE_SEED_NAME_IDS.has(spot.id)
          ? (seed.name || spot.name)
          : (spot.name || seed.name)
      )
    ),
    aliases: Array.isArray(seed.aliases) ? seed.aliases : spot.aliases,
    warnings:
      seed.id === 'ein-sataf' || seed.id === 'dafna-raz' || seed.id === 'ein-ayit' || forceDraftCopy
        ? ''
        : (seed.warnings || spot.warnings || ''),
    description: seed.id === 'dafna-raz' || forceDraftCopy
      ? (seed.description || '')
      : (seed.description || spot.description || ''),
    unverified: seed.unverified === false ? false : Boolean(seed.unverified || spot.unverified),
    listed: Object.prototype.hasOwnProperty.call(seed, 'listed')
      ? seed.listed === true
      : Boolean(spot.listed),
    height_min: seed.height_min ?? spot.height_min,
    height_max: seed.height_max ?? spot.height_max,
    height_estimated: seed.height_estimated ?? spot.height_estimated,
    height_label: forceDraftCopy ? '' : (seed.height_label || spot.height_label || ''),
    jump_heights: Array.isArray(seed.jump_heights) ? seed.jump_heights : (spot.jump_heights || seed.jump_heights),
    season: seed.id === 'dafna-raz' || forceDraftCopy ? (seed.season || '') : (seed.season || spot.season),
    water_depth: forceDraftCopy ? '' : (seed.water_depth || spot.water_depth),
    rocks: normalizeRocks(seed.rocks ?? seed.rocks_below ?? spot.rocks ?? spot.rocks_below),
    depth_known: seed.depth_known ?? spot.depth_known,
    entry_type: seed.entry_type || spot.entry_type,
    accessibility: seed.accessibility || spot.accessibility,
    waze_query: seed.waze_query || spot.waze_query || '',
    image_captions: seed.image_captions || spot.image_captions,
    ...(seed.location_approx === false || FORCE_SEED_COORDS_IDS.has(seed.id)
      ? { lat: seed.lat, lng: seed.lng, location_approx: seed.location_approx === true }
      : {}),
  };
}

function seedCoveredIdSet() {
  return new Set(
    seedSpots.flatMap((s) => [s.id, ...(Array.isArray(s.aliases) ? s.aliases.map(String) : [])])
  );
}

function mergeSeedWithLocal(extraDeletedIds = []) {
  const local = read(LS_SPOTS);
  const seedIds = seedCoveredIdSet();
  const deleted = deletedSpotIdSet(extraDeletedIds);
  return withoutRetiredSpots(
    [
      ...seedSpots.map((s) => overlaySeedFields(s)),
      ...local.filter((s) => !seedIds.has(s.id) && s.status === 'approved'),
    ].filter((s) => !deleted.has(String(s?.id))),
    extraDeletedIds
  );
}

async function loadApprovedSpots() {
  if (!(await canUseSite())) return [];
  if (useCloud()) {
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      if (error) {
        if (isNetworkFetchError(error)) markCloudUnreachable();
        else throw error;
      } else {
        let cloudDeletedIds = [];
        const deletedRes = await supabase.from('spots').select('id').eq('status', 'deleted');
        if (!deletedRes.error) {
          cloudDeletedIds = (deletedRes.data || []).map((s) => s.id);
        }
        const dbIds = new Set([
          ...(data || []).map((s) => s.id),
          ...cloudDeletedIds,
        ]);
        for (const row of data || []) {
          const seed = seedRecordForSpot(row);
          if (seed) dbIds.add(seed.id);
        }
        const extras = seedSpots.filter((s) => !dbIds.has(s.id));
        return withoutRetiredSpots(
          [...(data || []).map(overlaySeedFields), ...extras],
          cloudDeletedIds
        );
      }
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }
  return mergeSeedWithLocal();
}

export async function getAllSpots() {
  if (!(await canUseSite())) return [];
  const [spots, admin] = await Promise.all([loadApprovedSpots(), currentViewerIsAdmin()]);
  return visibleSpotsForViewer(spots, admin);
}

export async function getSpot(id) {
  if (isDeletedSpot(id)) return null;
  const admin = await currentViewerIsAdmin();
  const spots = visibleSpotsForViewer(await loadApprovedSpots(), admin);
  const key = String(id || '');
  const found = spots.find(
    (s) => s.id === key || (Array.isArray(s.aliases) && s.aliases.map(String).includes(key))
  );
  if (found) return found;
  if (!admin) return null;

  const pending = await getPendingSpots();
  return pending.find((s) => s.id === id) || null;
}

export async function getPendingSpots() {
  if (useCloud()) {
    const { data, error } = await supabase
      .from('spots')
      .select('*, profiles(display_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      if (isNetworkFetchError(error)) {
        markCloudUnreachable();
        return read(LS_PENDING);
      }
      throw error;
    }
    return data || [];
  }
  return read(LS_PENDING);
}

function collectJumpHeights(spot) {
  const fromList = Array.isArray(spot.jump_heights) ? spot.jump_heights : [];
  const fromMinMax = [spot.height_min, spot.height_max];
  return [...new Set([...fromList, ...fromMinMax].map(Number).filter((n) => n > 0))].sort(
    (a, b) => a - b
  );
}

export function normalizeInstagramUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return '';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isMissingSpotColumnError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('instagram_url') &&
      (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'))) ||
    (msg.includes('could not find the') && msg.includes('column'))
  );
}

async function insertSpotRow(newSpot) {
  const { data, error } = await supabase.from('spots').insert(newSpot).select().single();
  if (!error) return data;
  if (isMissingSpotColumnError(error)) {
    const { instagram_url, rocks, ...rest } = newSpot;
    const retry = await supabase.from('spots').insert(rest).select().single();
    if (retry.error) throw retry.error;
    return { ...retry.data, ...(instagram_url ? { instagram_url } : {}), ...(rocks ? { rocks } : {}) };
  }
  throw error;
}

function buildSpotRecord(spot, userId, profile) {
  const heights = collectJumpHeights(spot);
  const height_min = heights.length ? Math.min(...heights) : 0;
  const height_max = heights.length ? Math.max(...heights) : 0;
  const region = ['north', 'center', 'south'].includes(spot.region) ? spot.region : 'north';
  const accessibility = ['easy', 'medium', 'hard'].includes(spot.accessibility)
    ? spot.accessibility
    : 'medium';

  const record = {
    id: uid(),
    name: String(spot.name || '').trim(),
    region,
    lat: Number(spot.lat),
    lng: Number(spot.lng),
    height_min,
    height_max,
    accessibility,
    rocks: normalizeRocks(spot.rocks ?? spot.rocks_below),
    rocks_below: normalizeRocks(spot.rocks ?? spot.rocks_below) === 'אין' ? false : true,
    depth_known: Boolean(spot.depth_known),
    water_depth: spot.water_depth || 'לא ידוע',
    season: String(spot.season || '').trim(),
    warnings: String(spot.warnings || '').trim(),
    description: String(spot.description || '').trim(),
    created_by: userId,
    created_at: new Date().toISOString(),
    status: isAdmin(profile) ? 'approved' : 'pending',
  };
  const instagram_url = normalizeInstagramUrl(spot.instagram_url || spot.instagram_video);
  if (instagram_url) record.instagram_url = instagram_url;
  return record;
}

export function getFavoriteIds() {
  return read(LS_FAVORITES, []).map(String);
}

export function isFavorite(spotId) {
  return getFavoriteIds().includes(String(spotId));
}

export function toggleFavorite(spotId) {
  const id = String(spotId);
  const ids = getFavoriteIds();
  const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  write(LS_FAVORITES, next);
  return next.includes(id);
}

export async function getFavoriteSpots() {
  const ids = new Set(getFavoriteIds());
  if (!ids.size) return [];
  const spots = await getAllSpots();
  return spots.filter((spot) => ids.has(String(spot.id)));
}

export async function addSpot(spot, userId, profile) {
  const newSpot = buildSpotRecord(spot, userId, profile);

  if (isAdmin(profile)) {
    if (useCloud()) {
      const data = await insertSpotRow(newSpot);
      return { spot: data, pending: false };
    }
    const local = read(LS_SPOTS);
    local.push(newSpot);
    write(LS_SPOTS, local);
    return { spot: newSpot, pending: false };
  }

  if (useCloud()) {
    const data = await insertSpotRow(newSpot);
    await supabase.from('admin_notifications').insert({
      id: uid(),
      type: 'new_spot',
      title: 'ספוט חדש ממתין לאישור',
      body: spot.name,
      spot_id: newSpot.id,
      user_id: userId,
      read: false,
    });
    return { spot: data, pending: true };
  }

  const pending = read(LS_PENDING);
  pending.push(newSpot);
  write(LS_PENDING, pending);

  const submitter = (await getProfile(userId))?.display_name || 'משתמש';
  notifyAdmin({
    type: 'new_spot',
    title: 'ספוט חדש ממתין לאישור',
    body: `${spot.name} — הוגש על ידי ${submitter}`,
    spotId: newSpot.id,
    userId,
  });

  return { spot: newSpot, pending: true };
}

export async function approveSpot(spotId) {
  if (useCloud()) {
    const { data, error } = await supabase
      .from('spots')
      .update({ status: 'approved' })
      .eq('id', spotId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const pending = read(LS_PENDING);
  const idx = pending.findIndex((s) => s.id === spotId);
  if (idx === -1) throw new Error('הספוט לא נמצא');

  const [spot] = pending.splice(idx, 1);
  spot.status = 'approved';
  write(LS_PENDING, pending);

  const approved = read(LS_SPOTS);
  approved.push(spot);
  write(LS_SPOTS, approved);
  return spot;
}

export async function rejectSpot(spotId) {
  if (useCloud()) {
    await supabase.from('spots').delete().eq('id', spotId);
    return;
  }

  const pending = read(LS_PENDING).filter((s) => s.id !== spotId);
  write(LS_PENDING, pending);
}

export async function deleteSpot(spotId) {
  await requireAdminSession();
  const id = String(spotId || '').trim();
  if (!id) throw new Error('ספוט לא נמצא');

  persistIdList(LS_DELETED_SPOTS, id);
  write(LS_SPOTS, read(LS_SPOTS).filter((s) => String(s.id) !== id));
  write(LS_PENDING, read(LS_PENDING).filter((s) => String(s.id) !== id));

  if (useCloud()) {
    const { data: updated, error: updateErr } = await supabase
      .from('spots')
      .update({ status: 'deleted' })
      .eq('id', id)
      .select('id');
    if (updateErr || !updated?.length) {
      const seed = seedSpots.find((s) => s.id === id);
      const tombstone = {
        id,
        name: seed?.name || id,
        region: seed?.region || 'north',
        lat: Number(seed?.lat) || 0,
        lng: Number(seed?.lng) || 0,
        height_min: Number(seed?.height_min) || 0,
        height_max: Number(seed?.height_max) || 0,
        status: 'deleted',
        created_at: new Date().toISOString(),
      };
      const { error: insertErr } = await supabase.from('spots').insert(tombstone);
      if (insertErr) {
        await supabase.from('spots').delete().eq('id', id);
      }
    }
  }

  await logAudit('SPOT_DELETED', null, id);
}

export async function getRecentUserSpots(limit = 10) {
  if (useCloud()) {
    const { data } = await supabase
      .from('spots')
      .select('*, profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  const all = [
    ...read(LS_PENDING).map((s) => ({ ...s, status: 'pending' })),
    ...read(LS_SPOTS).map((s) => ({ ...s, status: s.status || 'approved' })),
  ];
  return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
}

// ─── Experiences ───

export async function getExperiences(spotId) {
  if (useCloud()) {
    const { data, error } = await supabase
      .from('experiences')
      .select('*, profiles(display_name)')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const all = read(LS_EXPERIENCES);
  const users = read(LS_USERS);
  return all
    .filter((e) => e.spot_id === spotId)
    .map((e) => ({
      ...e,
      profiles: users.find((u) => u.id === e.user_id) || { display_name: 'משתמש' },
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function addExperience({ spotId, userId, text, rating, photos = [] }) {
  const exp = {
    id: uid(),
    spot_id: spotId,
    user_id: userId,
    text,
    rating,
    photos,
    created_at: new Date().toISOString(),
  };

  if (useCloud()) {
    const { data, error } = await supabase.from('experiences').insert(exp).select().single();
    if (error) throw error;
    return data;
  }

  const all = read(LS_EXPERIENCES);
  all.push(exp);
  write(LS_EXPERIENCES, all);
  return exp;
}

// ─── Jumps ───

export async function getJumps(userId) {
  if (useCloud()) {
    const { data, error } = await supabase
      .from('jumps')
      .select('*, spots(name)')
      .eq('user_id', userId)
      .order('jumped_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const all = read(LS_JUMPS);
  const spots = await getAllSpots();
  return all
    .filter((j) => j.user_id === userId)
    .map((j) => ({
      ...j,
      spots: spots.find((s) => s.id === j.spot_id) || { name: 'ספוט' },
    }))
    .sort((a, b) => new Date(b.jumped_at) - new Date(a.jumped_at));
}

export async function addJump({ spotId, userId, height, notes = '' }) {
  const jump = {
    id: uid(),
    spot_id: spotId,
    user_id: userId,
    height,
    notes,
    jumped_at: new Date().toISOString(),
  };

  if (useCloud()) {
    const { data, error } = await supabase.from('jumps').insert(jump).select().single();
    if (error) throw error;
    return data;
  }

  const all = read(LS_JUMPS);
  all.push(jump);
  write(LS_JUMPS, all);
  return jump;
}

export async function getUserVisits(userId) {
  const jumps = await getJumps(userId);
  const experiences = useCloud()
    ? []
    : read(LS_EXPERIENCES).filter((e) => e.user_id === userId);

  const spotIds = new Set([
    ...jumps.map((j) => j.spot_id),
    ...experiences.map((e) => e.spot_id),
  ]);

  const spots = await getAllSpots();
  return [...spotIds].map((id) => spots.find((s) => s.id === id)).filter(Boolean);
}

// ─── Community: spot posts + meetups ───

async function requireUserSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('צריך להתחבר כדי לבצע פעולה זו');
  }
  if (!hasApprovedAccess(session.profile, session.user)) {
    throw new Error('ממתין לאישור כניסה לאתר');
  }
  return session;
}

export function isCloudSignedIn(session) {
  if (!session?.user?.id) return false;
  if (!hasSupabase) return true;
  const user = session.user;
  const authed = user.aud === 'authenticated' || user.role === 'authenticated';
  return authed && Boolean(session.accessToken);
}

async function requireCloudUserSession() {
  if (hasSupabase) {
    if (!useCloud()) {
      throw new Error('אין חיבור לשרת. בדקו אינטרנט ונסו שוב');
    }
    const session = await getSession();
    if (!isCloudSignedIn(session)) {
      throw new Error('צריך להתחבר');
    }
    return session;
  }
  return requireUserSession();
}

function isMissingRelationError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('could not find the table') ||
    (msg.includes('schema cache') && msg.includes('table'))
  );
}

function isMissingTableError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  return (
    isMissingRelationError(err) ||
    code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

function isPermissionWriteError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '');
  return (
    code === '42501' ||
    /row-level security/i.test(msg) ||
    /permission denied/i.test(msg) ||
    /not authenticated/i.test(msg)
  );
}

function socialWriteError(err, fallback) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (isMissingRelationError(err)) return fallback;
  if (isPermissionWriteError(err)) {
    return 'צריך להתחבר';
  }
  if (code === '23503') {
    return 'החשבון לא מוכן עדיין. התחברו מחדש ונסו שוב';
  }
  return msg || fallback;
}

function jumpVideoInsertError(err, fallback) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (isMissingRelationError(err) || isMissingTableError(err)) {
    return 'שמירת הסרטון נכשלה — חסרה טבלה או פונקציית פרסום. הריצו את SQL ב-Supabase.';
  }
  if (isPermissionWriteError(err)) {
    return 'שמירת הסרטון נחסמה (הרשאות). הריצו את SQL של הפרסום, התחברו מחדש ונסו שוב.';
  }
  if (code === '23503' || /profile missing/i.test(msg)) {
    return 'החשבון לא מוכן עדיין. התחברו מחדש ונסו שוב.';
  }
  if (code === '23502') {
    return 'חסר שדה חובה לשמירת הסרטון (ספוט או כתובת הסרטון).';
  }
  if (code === '23505') {
    return 'הסרטון כבר נשמר. רעננו את הפיד.';
  }
  return msg || fallback;
}

function logJumpPublish(step, extra = {}) {
  const safe = { step };
  if (extra.code) safe.code = String(extra.code);
  if (extra.message) safe.message = String(extra.message).slice(0, 180);
  if (extra.hint) safe.hint = String(extra.hint).slice(0, 120);
  if (extra.id) safe.id = String(extra.id);
  if (extra.bytes != null) safe.bytes = Number(extra.bytes) || 0;
  if (extra.spotId) safe.spotId = String(extra.spotId);
  console.info('[reels-publish]', safe);
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  for (const row of secondary) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of primary) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

function sessionDisplayName(session) {
  return (
    session?.profile?.display_name ||
    authDisplayName(session?.user) ||
    'משתמש'
  );
}

function normalizeSpotPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    spotId: row.spotId || row.spot_id,
    userId: row.userId || row.user_id,
    displayName: row.displayName || row.display_name || row.profiles?.display_name || 'משתמש',
    text: row.text || '',
    photo: row.photo || '',
    createdAt: row.createdAt || row.created_at,
  };
}

function normalizeMeetup(row) {
  if (!row) return null;
  return {
    id: row.id,
    spotId: row.spotId || row.spot_id,
    spotName: row.spotName || row.spot_name || 'ספוט',
    userId: row.userId || row.user_id,
    displayName: row.displayName || row.display_name || row.profiles?.display_name || 'משתמש',
    when: row.when || row.meetup_at,
    note: row.note || '',
    createdAt: row.createdAt || row.created_at,
  };
}

async function tryCloudTable(fn) {
  if (!useCloud()) return null;
  try {
    return await fn();
  } catch (err) {
    if (isNetworkFetchError(err)) markCloudUnreachable();
    if (isMissingTableError(err) || isNetworkFetchError(err)) return null;
    return null;
  }
}

export async function getSpotPosts(spotId = null) {
  if (!(await canUseSite())) return [];
  let cloudRows = [];
  const cloud = await tryCloudTable(async () => {
    let query = supabase.from('spot_posts').select('*').order('created_at', { ascending: false });
    if (spotId) query = query.eq('spot_id', spotId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
  if (cloud) cloudRows = cloud;

  const local = read(LS_SPOT_POSTS, [])
    .filter((p) => (spotId ? String(p.spotId || p.spot_id) === String(spotId) : true));

  return mergeById(cloudRows.map(normalizeSpotPost), local.map(normalizeSpotPost))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function addSpotPost({ spotId, text = '', photo = '' }) {
  const session = await requireUserSession();
  const trimmed = String(text || '').trim();
  if (!trimmed && !photo) {
    throw new Error('כתבו כמה מילים או הוסיפו תמונה');
  }

  const post = {
    id: uid(),
    spotId,
    userId: session.user.id,
    displayName: sessionDisplayName(session),
    text: trimmed,
    photo: photo || '',
    createdAt: new Date().toISOString(),
  };

  const cloudOk = await tryCloudTable(async () => {
    const { data, error } = await supabase
      .from('spot_posts')
      .insert({
        id: post.id,
        spot_id: post.spotId,
        user_id: post.userId,
        display_name: post.displayName,
        text: post.text,
        photo: post.photo,
        created_at: post.createdAt,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  const all = read(LS_SPOT_POSTS, []);
  all.unshift(post);
  write(LS_SPOT_POSTS, all.slice(0, 200));
  return cloudOk ? normalizeSpotPost(cloudOk) : post;
}

export async function getMeetups(options = {}) {
  const includeHidden = options.includeHidden === true;
  if (includeHidden) await requireAdminSession();
  else if (!(await canUseSite())) return [];

  let cloudRows = [];
  const cloud = await tryCloudTable(async () => {
    const { data, error } = await supabase
      .from('meetups')
      .select('*')
      .order('meetup_at', { ascending: true });
    if (error) throw error;
    return data || [];
  });
  if (cloud) cloudRows = cloud;

  const deletedMeetupIds = new Set(read(LS_DELETED_MEETUPS, []).map(String));
  const local = read(LS_MEETUPS, []);
  const all = mergeById(cloudRows.map(normalizeMeetup), local.map(normalizeMeetup))
    .filter((m) => m && !deletedMeetupIds.has(String(m.id)))
    .sort((a, b) => new Date(a.when) - new Date(b.when));

  if (includeHidden) return all;

  const visibleIds = new Set((await getAllSpots()).map((s) => String(s.id)));
  return all.filter((m) => !m.spotId || visibleIds.has(String(m.spotId)));
}

export async function deleteMeetup(meetupId) {
  await requireAdminSession();
  const id = String(meetupId || '').trim();
  if (!id) throw new Error('המפגש לא נמצא');

  persistIdList(LS_DELETED_MEETUPS, id);
  write(
    LS_MEETUPS,
    read(LS_MEETUPS, []).filter((m) => String(m.id) !== id)
  );

  await tryCloudTable(async () => {
    const { error } = await supabase.from('meetups').delete().eq('id', id);
    if (error) throw error;
    return true;
  });

  await logAudit('MEETUP_DELETED', null, id);
}

export async function getUpcomingMeetups() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const meetups = await getMeetups();
  return meetups.filter((m) => m.when && new Date(m.when) >= start);
}

export async function addMeetup({ spotId, spotName, when, note = '' }) {
  const session = await requireUserSession();
  if (!spotId) throw new Error('בחרו ספוט');
  if (!when) throw new Error('בחרו תאריך ושעה');

  const whenIso = new Date(when).toISOString();
  if (Number.isNaN(new Date(whenIso).getTime())) {
    throw new Error('תאריך לא תקין');
  }

  const meetup = {
    id: uid(),
    spotId,
    spotName: spotName || 'ספוט',
    userId: session.user.id,
    displayName: sessionDisplayName(session),
    when: whenIso,
    note: String(note || '').trim(),
    createdAt: new Date().toISOString(),
  };

  const cloudOk = await tryCloudTable(async () => {
    const { data, error } = await supabase
      .from('meetups')
      .insert({
        id: meetup.id,
        spot_id: meetup.spotId,
        spot_name: meetup.spotName,
        user_id: meetup.userId,
        display_name: meetup.displayName,
        meetup_at: meetup.when,
        note: meetup.note,
        created_at: meetup.createdAt,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  const all = read(LS_MEETUPS, []);
  all.unshift(meetup);
  write(LS_MEETUPS, all.slice(0, 200));
  return cloudOk ? normalizeMeetup(cloudOk) : meetup;
}

export async function getRecentPublicJumps(limit = 20) {
  if (!(await canUseSite())) return [];
  if (useCloud()) {
    const cloud = await tryCloudTable(async () => {
      const { data, error } = await supabase
        .from('jumps')
        .select('*, spots(name)')
        .order('jumped_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    });
    if (cloud) {
      return cloud.map((j) => ({
        id: j.id,
        spotId: j.spot_id,
        userId: j.user_id,
        displayName: 'משתמש',
        spotName: j.spots?.name || 'ספוט',
        height: j.height,
        notes: j.notes || '',
        createdAt: j.jumped_at,
      }));
    }
  }

  const spots = await getAllSpots();
  const users = read(LS_USERS, []);
  return read(LS_JUMPS, [])
    .map((j) => ({
      id: j.id,
      spotId: j.spot_id,
      userId: j.user_id,
      displayName: users.find((u) => u.id === j.user_id)?.display_name || 'משתמש',
      spotName: spots.find((s) => s.id === j.spot_id)?.name || 'ספוט',
      height: j.height,
      notes: j.notes || '',
      createdAt: j.jumped_at,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export async function getCommunityUpdates(limit = 40) {
  const spots = await getAllSpots();
  const visibleIds = new Set(spots.map((s) => String(s.id)));
  const spotName = (id) => spots.find((s) => String(s.id) === String(id))?.name || 'ספוט';

  const [posts, meetups, jumps] = await Promise.all([
    getSpotPosts(),
    getMeetups(),
    getRecentPublicJumps(limit),
  ]);
  const onVisibleSpot = (item) => !item.spotId || visibleIds.has(String(item.spotId));

  const items = [
    ...posts.map((p) => ({
      type: 'spot_post',
      id: `post-${p.id}`,
      createdAt: p.createdAt,
      spotId: p.spotId,
      spotName: spotName(p.spotId),
      displayName: p.displayName,
      text: p.text,
      photo: p.photo,
    })),
    ...meetups.map((m) => ({
      type: 'meetup',
      id: `meetup-${m.id}`,
      createdAt: m.createdAt,
      when: m.when,
      spotId: m.spotId,
      spotName: m.spotName || spotName(m.spotId),
      displayName: m.displayName,
      text: m.note,
    })),
    ...jumps.map((j) => ({
      type: 'jump',
      id: `jump-${j.id}`,
      createdAt: j.createdAt,
      spotId: j.spotId,
      spotName: j.spotName || spotName(j.spotId),
      displayName: j.displayName,
      height: j.height,
      text: j.notes,
    })),
  ];

  return items
    .filter((item) => item.createdAt && onVisibleSpot(item))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export const MAX_JUMP_VIDEO_BYTES = 40 * 1024 * 1024;

/** Must match storage bucket `jump-videos` allowed_mime_types (migration 006). */
export const JUMP_VIDEO_ALLOWED_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2'];

const JUMP_VIDEO_EXT_MIME = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  '3g2': 'video/3gpp2',
};

/**
 * Base MIME for upload: strips parameters such as `;codecs=vp9,opus`
 * (MediaRecorder output) so the Content-Type matches the bucket allow-list.
 * Maps aliases (video/x-m4v -> video/mp4) and infers from the extension when
 * the browser leaves `file.type` empty (common on iOS Photos).
 * Returns '' when the type is not allowed.
 */
export function jumpVideoContentType(file) {
  let base = String(file?.type || '').split(';')[0].trim().toLowerCase();
  if (base === 'video/x-m4v' || base === 'video/m4v') base = 'video/mp4';
  if (!base || base === 'application/octet-stream') {
    const ext = String(file?.name || '').split('.').pop().toLowerCase();
    base = JUMP_VIDEO_EXT_MIME[ext] || '';
  }
  return JUMP_VIDEO_ALLOWED_MIME.includes(base) ? base : '';
}

export const JUMP_VIDEO_TOO_BIG_MSG = 'הסרטון גדול מדי — אפשר להעלות עד 40MB. קצרו את הסרטון ונסו שוב.';
export const JUMP_VIDEO_BAD_TYPE_MSG = 'סוג הקובץ לא נתמך. אפשר להעלות MP4, MOV, WebM או 3GP.';

function normalizeJumpVideo(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId || row.user_id,
    displayName: row.displayName || row.display_name || 'משתמש',
    spotId: row.spotId || row.spot_id,
    spotName: row.spotName || row.spot_name || 'ספוט',
    caption: row.caption || '',
    videoUrl: row.videoUrl || row.video_url,
    createdAt: row.createdAt || row.created_at,
  };
}

function profilePhotoFromRow(row) {
  return (
    row?.avatar_url ||
    row?.photo_url ||
    row?.avatar ||
    row?.photo ||
    row?.image ||
    ''
  );
}

function normalizeVideoComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    videoId: row.videoId || row.video_id,
    userId: row.userId || row.user_id,
    displayName: row.displayName || row.display_name || 'משתמש',
    text: row.text || '',
    createdAt: row.createdAt || row.created_at,
    avatarUrl: profilePhotoFromRow(row) || '',
  };
}

async function attachCommentProfileAvatars(comments) {
  const list = comments || [];
  const ids = [...new Set(list.map((c) => c.userId).filter(Boolean))];
  if (!ids.length || !useCloud()) return list;
  try {
    const { data } = await supabase.from('profiles').select('*').in('id', ids);
    const byId = Object.fromEntries((data || []).map((p) => [p.id, p]));
    return list.map((comment) => {
      const profile = byId[comment.userId];
      const avatarUrl = profilePhotoFromRow(profile) || comment.avatarUrl || '';
      const displayName =
        (profile?.display_name && profile.display_name !== 'משתמש'
          ? profile.display_name
          : comment.displayName) || 'משתמש';
      return { ...comment, avatarUrl, displayName };
    });
  } catch {
    return list;
  }
}

function storageUnavailableError(err) {
  const msg = String(err?.message || err?.error || '').toLowerCase();
  return (
    isMissingTableError(err) ||
    msg.includes('bucket') ||
    msg.includes('not found') ||
    msg.includes('does not exist')
  );
}

async function fetchJumpVideoRows({ limit = 40, userId = null, ids = null } = {}) {
  if (!(await canUseSite())) return [];
  if (ids && !ids.length) return [];
  const cloud = await tryCloudTable(async () => {
    let query = supabase
      .from('jump_videos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(ids?.length ? Math.max(limit, ids.length) : limit);
    if (userId) query = query.eq('user_id', userId);
    if (ids?.length) query = query.in('id', ids);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
  const rows = (cloud || []).map(normalizeJumpVideo).filter((row) => row?.videoUrl);
  const visibleIds = new Set((await getAllSpots()).map((s) => String(s.id)));
  return rows.filter((row) => !row.spotId || visibleIds.has(String(row.spotId)));
}

export async function getJumpVideos(limit = 40) {
  return fetchJumpVideoRows({ limit });
}

export async function getJumpVideosByUser(userId, limit = 60) {
  if (!userId) return [];
  return fetchJumpVideoRows({ limit, userId });
}

export async function getJumpVideoById(videoId) {
  if (!videoId) return null;
  const rows = await fetchJumpVideoRows({ ids: [videoId], limit: 1 });
  return rows[0] || null;
}

const SAVES_UNAVAILABLE_MSG = 'שמירה עדיין לא פעילה. צריך עדכון במסד הנתונים.';

export async function getMySavedJumpVideos(limit = 80) {
  if (!useCloud()) throw new Error('צריך חיבור כדי לראות שמורים');
  const session = await getSession();
  if (!isCloudSignedIn(session)) {
    throw new Error('צריך להתחבר כדי לראות שמורים');
  }

  const { data, error } = await supabase
    .from('jump_video_saves')
    .select('video_id, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) throw new Error(SAVES_UNAVAILABLE_MSG);
    throw new Error(socialWriteError(error, 'לא הצלחנו לטעון שמורים'));
  }

  const ids = [...new Set((data || []).map((row) => row.video_id).filter(Boolean))];
  if (!ids.length) return [];
  const videos = await fetchJumpVideoRows({ ids, limit: ids.length });
  const byId = Object.fromEntries(videos.map((video) => [video.id, video]));
  return ids.map((id) => byId[id]).filter(Boolean);
}

async function attachReelAuthorProfiles(list) {
  const userIds = [...new Set(list.map((v) => v.userId).filter(Boolean))];
  const byId = {};
  if (userIds.length && useCloud()) {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);
      if (!error) {
        (profiles || []).forEach((p) => {
          byId[p.id] = p;
        });
      }
    } catch {
      /* names/avatars still filled from jump_videos + local cache */
    }
  }
  if (userIds.length) {
    const locals = read(LS_USERS, []);
    (Array.isArray(locals) ? locals : []).forEach((user) => {
      if (user?.id && userIds.includes(user.id) && !byId[user.id]) {
        byId[user.id] = user;
      }
    });
  }
  list.forEach((video) => {
    const profile = withCachedAvatar(byId[video.userId] || { id: video.userId });
    video.avatarUrl = profilePhotoFromRow(profile) || video.avatarUrl || '';
    if (profile?.display_name && (!video.displayName || video.displayName === 'משתמש')) {
      video.displayName = profile.display_name;
    }
  });
}

export async function decorateReelsVideos(videos, viewerUserId = null) {
  const list = (videos || []).map((video) => ({
    ...video,
    avatarUrl: '',
    likeCount: 0,
    liked: false,
    commentCount: 0,
    likesAvailable: true,
    saved: false,
    savesAvailable: true,
  }));
  await attachReelAuthorProfiles(list);
  const ids = list.map((v) => v.id).filter(Boolean);
  if (!ids.length || !useCloud()) return list;

  try {
    const { data: likeRows, error: likeError } = await supabase
      .from('jump_video_likes')
      .select('video_id, user_id')
      .in('video_id', ids);
    if (likeError) {
      if (isMissingRelationError(likeError)) {
        list.forEach((video) => {
          video.likesAvailable = false;
        });
      }
    } else {
      const counts = {};
      const liked = new Set();
      (likeRows || []).forEach((row) => {
        const vid = row.video_id;
        counts[vid] = (counts[vid] || 0) + 1;
        if (viewerUserId && row.user_id === viewerUserId) liked.add(vid);
      });
      list.forEach((video) => {
        video.likeCount = counts[video.id] || 0;
        video.liked = liked.has(video.id);
      });
    }
  } catch (err) {
    if (isMissingRelationError(err)) {
      list.forEach((video) => {
        video.likesAvailable = false;
      });
    }
  }

  if (viewerUserId) {
    try {
      const { data: saveRows, error: saveError } = await supabase
        .from('jump_video_saves')
        .select('video_id')
        .eq('user_id', viewerUserId)
        .in('video_id', ids);
      if (saveError) {
        if (isMissingRelationError(saveError)) {
          list.forEach((video) => {
            video.savesAvailable = false;
          });
        }
      } else {
        const saved = new Set((saveRows || []).map((row) => row.video_id));
        list.forEach((video) => {
          video.saved = saved.has(video.id);
        });
      }
    } catch (err) {
      if (isMissingRelationError(err)) {
        list.forEach((video) => {
          video.savesAvailable = false;
        });
      }
    }
  }

  try {
    const { data: commentRows } = await supabase
      .from('jump_video_comments')
      .select('video_id')
      .in('video_id', ids);
    const commentCounts = {};
    (commentRows || []).forEach((row) => {
      commentCounts[row.video_id] = (commentCounts[row.video_id] || 0) + 1;
    });
    list.forEach((video) => {
      video.commentCount = commentCounts[video.id] || 0;
    });
  } catch {
    /* comments stay at 0 */
  }

  return list;
}

export async function toggleJumpVideoLike(videoId) {
  const session = await requireCloudUserSession();
  if (!useCloud()) throw new Error('צריך חיבור כדי לעשות לייק');
  if (!videoId) throw new Error('סרטון לא נמצא');

  const { data: existing, error: selError } = await supabase
    .from('jump_video_likes')
    .select('video_id')
    .eq('video_id', videoId)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (selError) {
    if (isMissingRelationError(selError)) {
      throw new Error('לייקים עדיין לא פעילים. צריך להריץ את עדכון מסד הנתונים.');
    }
    throw new Error(socialWriteError(selError, 'הלייק נכשל'));
  }

  if (existing) {
    const { error } = await supabase
      .from('jump_video_likes')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', session.user.id);
    if (error) throw new Error(socialWriteError(error, 'הסרת הלייק נכשלה'));
    return { liked: false };
  }

  const { error } = await supabase.from('jump_video_likes').insert({
    video_id: videoId,
    user_id: session.user.id,
  });
  if (error) {
    if (error.code === '23505') return { liked: true };
    if (isMissingRelationError(error)) {
      throw new Error('לייקים עדיין לא פעילים. צריך להריץ את עדכון מסד הנתונים.');
    }
    throw new Error(socialWriteError(error, 'הלייק נכשל'));
  }
  return { liked: true };
}

export async function toggleJumpVideoSave(videoId) {
  const session = await requireCloudUserSession();
  if (!useCloud()) throw new Error('צריך חיבור כדי לשמור');
  if (!videoId) throw new Error('סרטון לא נמצא');

  const { data: existing, error: selError } = await supabase
    .from('jump_video_saves')
    .select('video_id')
    .eq('video_id', videoId)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (selError) {
    if (isMissingRelationError(selError)) {
      throw new Error(SAVES_UNAVAILABLE_MSG);
    }
    throw new Error(socialWriteError(selError, 'השמירה נכשלה'));
  }

  if (existing) {
    const { error } = await supabase
      .from('jump_video_saves')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', session.user.id);
    if (error) throw new Error(socialWriteError(error, 'ההסרה מהשמורים נכשלה'));
    return { saved: false };
  }

  const { error } = await supabase.from('jump_video_saves').insert({
    video_id: videoId,
    user_id: session.user.id,
  });
  if (error) {
    if (error.code === '23505') return { saved: true };
    if (isMissingRelationError(error)) {
      throw new Error(SAVES_UNAVAILABLE_MSG);
    }
    throw new Error(socialWriteError(error, 'השמירה נכשלה'));
  }
  return { saved: true };
}

export async function getJumpVideoComments(videoId) {
  if (!videoId) return [];
  if (!useCloud()) return [];
  const { data, error } = await supabase
    .from('jump_video_comments')
    .select('*')
    .eq('video_id', videoId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(socialWriteError(error, 'לא הצלחנו לטעון תגובות'));
  }
  return attachCommentProfileAvatars((data || []).map(normalizeVideoComment).filter(Boolean));
}

export async function addJumpVideoComment(videoId, text) {
  const session = await requireCloudUserSession();
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('כתבו תגובה');
  if (!useCloud()) throw new Error('צריך חיבור כדי להגיב');
  if (!videoId) throw new Error('סרטון לא נמצא');

  const row = {
    id: uid(),
    video_id: videoId,
    user_id: session.user.id,
    display_name: sessionDisplayName(session),
    text: trimmed,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('jump_video_comments')
    .insert(row)
    .select()
    .single();
  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('תגובות עדיין לא פעילות. נסו שוב מאוחר יותר.');
    }
    throw new Error(socialWriteError(error, 'שליחת התגובה נכשלה'));
  }
  return normalizeVideoComment(data || row);
}

function resolveStorageSignedUrl(signedUrl) {
  const raw = String(signedUrl || '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(SUPABASE_URL || '').replace(/\/$/, '');
  if (raw.startsWith('/storage/v1')) return `${base}${raw}`;
  if (raw.startsWith('storage/v1')) return `${base}/${raw}`;
  if (raw.startsWith('/')) return `${base}/storage/v1${raw}`;
  return `${base}/storage/v1/${raw}`;
}

export const UPLOAD_CANCELLED = 'UPLOAD_CANCELLED';

export function isUploadCancelled(err) {
  return err?.code === UPLOAD_CANCELLED || err?.name === UPLOAD_CANCELLED || err?.message === UPLOAD_CANCELLED;
}

function cancelledUploadError() {
  const err = new Error(UPLOAD_CANCELLED);
  err.code = UPLOAD_CANCELLED;
  err.name = UPLOAD_CANCELLED;
  return err;
}

function xhrPutFile(url, file, { contentType, headers = {}, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledUploadError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onSignalAbort = () => xhr.abort();
    signal?.addEventListener('abort', onSignalAbort, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', onSignalAbort);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream');
    Object.entries(headers).forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        phase: 'upload',
        loaded: event.loaded,
        total: event.total || file.size,
        indeterminate: false,
      });
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({
          phase: 'upload',
          loaded: file.size,
          total: file.size,
          indeterminate: false,
        });
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || `upload ${xhr.status}`));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error('העלאת הסרטון נכשלה'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(cancelledUploadError());
    };
    xhr.send(file);
  });
}

async function uploadJumpVideoObject(path, file, onProgress, accessToken, signal) {
  // Never send `video/webm;codecs=...` — the bucket allow-list only matches base MIME types.
  const contentType = jumpVideoContentType(file) || 'video/mp4';
  if (!accessToken) throw new Error('צריך להתחבר');
  if (signal?.aborted) throw cancelledUploadError();
  const authHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken}`,
  };

  const signed = await supabase.storage.from('jump-videos').createSignedUploadUrl(path);
  if (signal?.aborted) throw cancelledUploadError();
  if (!signed.error && (signed.data?.signedUrl || signed.data?.token)) {
    const url =
      resolveStorageSignedUrl(signed.data.signedUrl) ||
      `${String(SUPABASE_URL).replace(/\/$/, '')}/storage/v1/object/upload/sign/${path}?token=${encodeURIComponent(signed.data.token)}`;
    try {
      await xhrPutFile(url, file, { contentType, onProgress, signal });
      return;
    } catch (err) {
      if (isUploadCancelled(err)) throw err;
      try {
        await xhrPutFile(url, file, { contentType, headers: authHeaders, onProgress, signal });
        return;
      } catch (retryErr) {
        if (isUploadCancelled(retryErr)) throw retryErr;
        /* fetch upload below — no byte progress */
      }
    }
  }

  if (signal?.aborted) throw cancelledUploadError();
  onProgress?.({ phase: 'upload', loaded: 0, total: file.size, indeterminate: true, cancelLocked: true });
  const { error: uploadError } = await supabase.storage.from('jump-videos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });
  if (uploadError) throw uploadError;
  onProgress?.({
    phase: 'upload',
    loaded: file.size,
    total: file.size,
    indeterminate: false,
  });
}

export async function addJumpVideo({ spotId, spotName, caption = '', file, onProgress, signal } = {}) {
  const session = await requireCloudUserSession();
  if (!useCloud()) throw new Error('העלאת סרטונים דורשת חיבור.');
  const userId = session.user.id;
  const accessToken = session.accessToken;
  if (!userId || !accessToken) throw new Error('צריך להתחבר');
  const resolvedName = String(spotName || '').trim();
  const resolvedId = String(spotId || '').trim() || (resolvedName ? `custom:${resolvedName}` : '');
  if (!resolvedName && !resolvedId) throw new Error('נא לתייג ספוט');
  if (!file) throw new Error('נא לבחור סרטון');
  const uploadType = jumpVideoContentType(file);
  if (!uploadType) {
    throw new Error(JUMP_VIDEO_BAD_TYPE_MSG);
  }
  if (file.size > MAX_JUMP_VIDEO_BYTES) {
    throw new Error(JUMP_VIDEO_TOO_BIG_MSG);
  }

  const MIME_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/3gpp2': '3g2' };
  const rawExt = String(file.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = (rawExt && JUMP_VIDEO_EXT_MIME[rawExt] === uploadType) ? rawExt : MIME_EXT[uploadType];
  const path = `${userId}/${uid()}.${ext}`;
  logJumpPublish('storage-start', { bytes: file.size, spotId: resolvedId });
  try {
    await uploadJumpVideoObject(path, file, onProgress, accessToken, signal);
  } catch (uploadError) {
    if (isUploadCancelled(uploadError)) {
      await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
      throw uploadError;
    }
    logJumpPublish('storage-fail', {
      code: uploadError?.code || uploadError?.statusCode,
      message: uploadError?.message,
    });
    if (storageUnavailableError(uploadError)) {
      throw new Error('העלאת סרטונים עדיין לא פעילה. נסו שוב מאוחר יותר.');
    }
    throw new Error(socialWriteError(uploadError, 'העלאת הסרטון נכשלה'));
  }
  logJumpPublish('storage-ok', { bytes: file.size });

  if (signal?.aborted) {
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
    throw cancelledUploadError();
  }

  const { data: publicData } = supabase.storage.from('jump-videos').getPublicUrl(path);
  const videoUrl = publicData?.publicUrl;
  if (!videoUrl) {
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
    logJumpPublish('public-url-fail');
    throw new Error('העלאת הסרטון נכשלה');
  }

  onProgress?.({ phase: 'save', loaded: 1, total: 1, indeterminate: false, cancelLocked: true });

  const live = await requireCloudUserSession();
  const row = {
    id: uid(),
    user_id: live.user.id,
    display_name: sessionDisplayName(live),
    spot_id: resolvedId,
    spot_name: resolvedName || 'ספוט',
    caption: String(caption || '').trim().slice(0, 200),
    video_url: videoUrl,
  };

  logJumpPublish('insert-start', { id: row.id, spotId: resolvedId });
  let { data, error } = await supabase.from('jump_videos').insert(row).select().single();

  if (error && (isPermissionWriteError(error) || isMissingTableError(error))) {
    logJumpPublish('insert-retry-rpc', { code: error.code, message: error.message });
    const rpc = await supabase.rpc('publish_jump_video', {
      p_id: row.id,
      p_spot_id: row.spot_id,
      p_spot_name: row.spot_name,
      p_caption: row.caption,
      p_video_url: row.video_url,
    });
    if (!rpc.error && rpc.data) {
      data = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      error = null;
    } else if (rpc.error && !isMissingRelationError(rpc.error)) {
      error = rpc.error;
    }
  }

  if (error || !data?.id) {
    const existing = await supabase.from('jump_videos').select().eq('id', row.id).maybeSingle();
    if (existing.data?.id) {
      data = existing.data;
      error = null;
    }
  }

  if (error || !data?.id || !(data.video_url || data.videoUrl)) {
    logJumpPublish('insert-fail', {
      code: error?.code,
      message: error?.message,
      hint: error?.hint || error?.details,
    });
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
    throw new Error(jumpVideoInsertError(error, 'שמירת הסרטון נכשלה'));
  }

  const published = normalizeJumpVideo(data);
  if (!published?.id || !published.videoUrl) {
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
    logJumpPublish('insert-empty');
    throw new Error('שמירת הסרטון נכשלה');
  }
  logJumpPublish('published', { id: published.id });
  return published;
}

export function canManageJumpVideo(video, session) {
  if (!session?.user?.id || !video) return false;
  if (String(video.userId || '') === String(session.user.id)) return true;
  return isAdmin(session.profile, session.user);
}

function jumpVideoStoragePath(videoUrl) {
  const raw = String(videoUrl || '');
  const markers = ['/object/public/jump-videos/', '/object/sign/jump-videos/', '/object/authenticated/jump-videos/'];
  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(raw.slice(idx + marker.length).split('?')[0]);
    }
  }
  return '';
}

export async function updateJumpVideo(videoId, { caption, spotId, spotName } = {}) {
  const session = await requireCloudUserSession();
  if (!useCloud()) throw new Error('צריך חיבור כדי לערוך');
  if (!videoId) throw new Error('סרטון לא נמצא');

  const existing = await getJumpVideoById(videoId);
  if (!existing) throw new Error('סרטון לא נמצא');
  if (!canManageJumpVideo(existing, session)) {
    throw new Error('אין הרשאה לערוך את הסרטון');
  }
  const resolvedName = String(spotName || '').trim();
  const resolvedId = String(spotId || '').trim() || (resolvedName ? `custom:${resolvedName}` : '');
  if (!resolvedName && !resolvedId) throw new Error('נא לתייג ספוט');

  const patch = {
    caption: String(caption || '').trim().slice(0, 200),
    spot_id: resolvedId,
    spot_name: resolvedName || 'ספוט',
  };

  const { data, error } = await supabase
    .from('jump_videos')
    .update(patch)
    .eq('id', videoId)
    .select()
    .single();
  if (error) throw new Error(socialWriteError(error, 'שמירת העריכה נכשלה'));
  return normalizeJumpVideo(data);
}

export async function deleteJumpVideo(videoId) {
  const session = await requireCloudUserSession();
  if (!useCloud()) throw new Error('צריך חיבור כדי למחוק');
  if (!videoId) throw new Error('סרטון לא נמצא');

  const existing = await getJumpVideoById(videoId);
  if (!existing) throw new Error('סרטון לא נמצא');
  if (!canManageJumpVideo(existing, session)) {
    throw new Error('אין הרשאה למחוק את הסרטון');
  }

  const path = jumpVideoStoragePath(existing.videoUrl);
  const { error } = await supabase.from('jump_videos').delete().eq('id', videoId);
  if (error) throw new Error(socialWriteError(error, 'מחיקת הסרטון נכשלה'));

  if (path) {
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
  }
  return { id: videoId };
}

// ─── Admin users ───

async function requireAdminSession() {
  const session = await getSession();
  if (!session || !isAdmin(session.profile, session.user)) {
    throw new Error('אין הרשאות מנהל');
  }
  return session;
}

export async function getAllUsers() {
  await requireAdminSession();

  if (useCloud()) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, is_admin, status, created_at, last_login_at')
      .order('display_name');
    if (error) throw error;
    return data || [];
  }

  ensureLocalInvitations();
  return read(LS_USERS).map(({ password, ...user }) => ({
    status: 'active',
    ...user,
  }));
}

export async function getAdminUserSummary() {
  const users = await getAllUsers();
  return {
    total: users.length,
    active: users.filter((u) => (u.status || 'active') === 'active').length,
    pending: users.filter((u) => u.status === 'pending').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
    admins: users.filter((u) => u.is_admin).length,
  };
}

export async function updateUserRole(userId, makeAdmin) {
  invalidateSessionCache();
  const session = await requireAdminSession();
  if (userId === session.profile.id && !makeAdmin) {
    const users = await getAllUsers();
    const activeAdmins = users.filter((u) => u.is_admin && u.status !== 'disabled' && u.id !== userId);
    if (activeAdmins.length === 0) {
      throw new Error('לא ניתן להסיר את המנהל האחרון');
    }
  }

  if (useCloud()) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_admin: makeAdmin })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    await logAudit('USER_ROLE_CHANGED', userId, makeAdmin ? 'promoted to admin' : 'demoted to user');
    return data;
  }

  const users = read(LS_USERS);
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  user.is_admin = makeAdmin;
  write(LS_USERS, users);
  await logAudit('USER_ROLE_CHANGED', userId, makeAdmin ? 'promoted to admin' : 'demoted to user');
  return user;
}

export async function updateUserStatus(userId, status) {
  invalidateSessionCache();
  const session = await requireAdminSession();
  if (userId === session.profile.id && status === 'disabled') {
    throw new Error('לא ניתן להשבית את החשבון שלך');
  }

  if (useCloud()) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    await logAudit(
      status === 'disabled' ? 'USER_DISABLED' : status === 'pending' ? 'USER_PENDING' : 'USER_REACTIVATED',
      userId,
      status
    );
    return data;
  }

  const users = read(LS_USERS);
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('משתמש לא נמצא');
  if (user.is_admin && status === 'disabled') {
    const activeAdmins = users.filter((u) => u.is_admin && u.status !== 'disabled' && u.id !== userId);
    if (activeAdmins.length === 0) throw new Error('לא ניתן להשבית את המנהל האחרון');
  }
  user.status = status;
  write(LS_USERS, users);
  await logAudit(
    status === 'disabled' ? 'USER_DISABLED' : 'USER_REACTIVATED',
    userId,
    status
  );
  return user;
}

export async function deleteUser(userId) {
  const session = await requireAdminSession();
  if (!userId) throw new Error('משתמש לא נמצא');
  if (userId === session.profile.id) {
    throw new Error('לא ניתן למחוק את החשבון שלך');
  }

  if (useCloud()) {
    const { error } = await supabase.rpc('admin_delete_user', { target_id: userId });
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('function') && msg.toLowerCase().includes('admin_delete_user')) {
        throw new Error('מחיקה דורשת הרצת SQL ב-Supabase (019_admin_delete_user).');
      }
      throw new Error(msg || 'מחיקת המשתמש נכשלה');
    }
    return { id: userId };
  }

  const users = read(LS_USERS);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  const [removed] = users.splice(idx, 1);
  if (removed?.is_admin) {
    const activeAdmins = users.filter((u) => u.is_admin && u.status !== 'disabled');
    if (activeAdmins.length === 0) {
      users.splice(idx, 0, removed);
      throw new Error('לא ניתן למחוק את המנהל האחרון');
    }
  }
  write(LS_USERS, users);
  const sessionLocal = read(LS_SESSION, null);
  if (sessionLocal?.userId === userId) write(LS_SESSION, null);
  await logAudit('USER_DELETED', userId, removed?.email || removed?.display_name || '');
  return { id: userId };
}

export async function getInvitations() {
  await requireAdminSession();

  if (useCloud()) {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  return ensureLocalInvitations();
}

export async function addInvitation(email) {
  const session = await requireAdminSession();
  const normalized = email.toLowerCase().trim();
  if (!normalized) throw new Error('נא להזין אימייל');

  const alreadyInvited = await isEmailInvited(normalized);
  const users = await getAllUsers();
  if (users.some((u) => (u.email || '').toLowerCase() === normalized)) {
    throw new Error('משתמש עם אימייל זה כבר קיים');
  }
  if (alreadyInvited) throw new Error('ההזמנה כבר קיימת');

  const invite = {
    id: uid(),
    email: normalized,
    invited_by: session.profile.id,
    used_at: null,
    created_at: new Date().toISOString(),
  };

  if (useCloud()) {
    const { data, error } = await supabase.from('invitations').insert(invite).select().single();
    if (error) throw error;
    await logAudit('INVITATION_CREATED', null, normalized);
    return data;
  }

  const invitations = ensureLocalInvitations();
  invitations.unshift(invite);
  write(LS_INVITATIONS, invitations);
  await logAudit('INVITATION_CREATED', null, normalized);
  return invite;
}

export async function revokeInvitation(invitationId) {
  await requireAdminSession();

  if (useCloud()) {
    const { data: row } = await supabase.from('invitations').select('email').eq('id', invitationId).single();
    const { error } = await supabase.from('invitations').delete().eq('id', invitationId);
    if (error) throw error;
    await logAudit('INVITATION_REVOKED', null, row?.email || invitationId);
    return;
  }

  const invitations = ensureLocalInvitations().filter((i) => i.id !== invitationId);
  write(LS_INVITATIONS, invitations);
  await logAudit('INVITATION_REVOKED', null, invitationId);
}

export async function getAuditLog(limit = 50) {
  await requireAdminSession();

  if (useCloud()) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  return read(LS_AUDIT_LOG, []).slice(0, limit);
}

export async function getUserStats(userId) {
  const jumps = await getJumps(userId);
  const visits = await getUserVisits(userId);
  const maxJumpHeight = jumps.length
    ? Math.max(...jumps.map((j) => j.height || 0))
    : 0;

  return {
    jumpsCount: jumps.length,
    visitsCount: visits.length,
    maxJumpHeight,
  };
}

export const REGION_LABELS = {
  north: 'צפון',
  center: 'מרכז',
  south: 'דרום',
};

export const ACCESSIBILITY_LABELS = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

export const ENTRY_LABELS = {
  deep: 'כניסה עמוקה',
  shallow: 'כניסה רדודה',
  unknown: 'לא ידוע',
};
