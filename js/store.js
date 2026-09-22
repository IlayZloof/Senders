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
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const CLOUD_DOWN_KEY = 'sendit_cloud_down';

function markCloudUnreachable() {
  try {
    sessionStorage.setItem(CLOUD_DOWN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

function isCloudUnreachable() {
  try {
    return sessionStorage.getItem(CLOUD_DOWN_KEY) === '1';
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
    const newProfile = {
      id: authUser.id,
      display_name: authDisplayName(authUser, displayName),
      email,
      is_admin: isAdminEmail(email),
      status: 'active',
      created_at: authUser.created_at || new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').insert(newProfile);
    if (error) throw error;
    profile = newProfile;
  }

  return profile;
}

function assertActiveProfile(profile) {
  if (profile?.status === 'disabled') {
    throw new Error('החשבון הושבת. פנו למנהל.');
  }
}

// ─── Auth ───

function getLocalSession() {
  const session = read(LS_SESSION, null);
  if (!session) return null;
  const users = read(LS_USERS);
  syncLocalAdminFlags(users);
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  assertActiveProfile(user);
  return { user, profile: user };
}

export async function getSession() {
  if (useCloud()) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const authUser = data.session.user;
        let profile = await getProfile(authUser.id);

        if (!profile) {
          profile = await ensureProfileForAuthUser(authUser);
        }

        assertActiveProfile(profile);

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

        return {
          user: authUser,
          profile: profile
            ? { ...profile, email: profile.email || authUser.email }
            : {
                id: authUser.id,
                display_name: authUser.user_metadata?.display_name || 'משתמש',
                email: authUser.email,
                is_admin: isAdminEmail(email),
                status: 'active',
                created_at: authUser.created_at,
              },
        };
      }
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }

  return getLocalSession();
}

export async function signInWithGoogle(redirectPath = 'login.html') {
  if (!supabase) {
    throw new Error('התחברות עם Google דורשת חיבור ל-Supabase');
  }

  const redirectTo = `${window.location.origin}/${redirectPath.replace(/^\//, '')}`;
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
    status: 'active',
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
  assertActiveProfile(user);
  if (isAdminEmail(normalizedEmail)) user.is_admin = true;
  user.last_login_at = new Date().toISOString();
  write(LS_USERS, users);
  write(LS_SESSION, { userId: user.id });
  return { user };
}

export async function signUp(email, password, displayName) {
  const normalizedEmail = email.toLowerCase();
  const isAdminUser = isAdminEmail(normalizedEmail);

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
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: displayName,
          email: normalizedEmail,
          is_admin: isAdminUser,
          status: 'active',
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
        assertActiveProfile(profile);

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
  if (useCloud()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (!isNetworkFetchError(err)) throw err;
      markCloudUnreachable();
    }
  }
  localStorage.removeItem(LS_SESSION);
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

export async function getProfile(userId) {
  if (useCloud()) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return data;
  }
  const users = read(LS_USERS);
  return users.find((u) => u.id === userId) || null;
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
const FORCE_SEED_NAME_IDS = new Set(['kishon-bridge', 'rosh-hanikra', 'ein-ayit']);

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

function visibleSpotsForViewer(list, admin) {
  if (admin) return list || [];
  return (list || []).filter((s) => !isUnverifiedSpot(s));
}

function overlaySeedFields(spot) {
  const seed = seedSpots.find((s) => s.id === spot?.id);
  if (!seed) return spot;
  const instagram_url = normalizeInstagramUrl(seed.instagram_url || spot.instagram_url || spot.instagram_video);
  const videos = uniqueMediaList(spot.videos, seed.videos);
  const images = uniqueMediaList(spot.images, seed.images);
  return {
    ...seed,
    ...spot,
    image: spot.image || seed.image,
    images: images.length ? images : spot.images || seed.images,
    videos: videos.length ? videos : spot.videos || seed.videos,
    instagram_url: instagram_url || seed.instagram_url || spot.instagram_url || '',
    name: FORCE_SEED_NAME_IDS.has(seed.id) ? (seed.name || spot.name) : (spot.name || seed.name),
    aliases: Array.isArray(seed.aliases) ? seed.aliases : spot.aliases,
    warnings: seed.warnings || spot.warnings || '',
    description: seed.description || spot.description || '',
    unverified: seed.unverified === false ? false : Boolean(seed.unverified || spot.unverified),
    height_min: seed.height_min ?? spot.height_min,
    height_max: seed.height_max ?? spot.height_max,
    height_estimated: seed.height_estimated ?? spot.height_estimated,
    jump_heights: seed.jump_heights || spot.jump_heights,
    season: seed.season || spot.season,
    water_depth: seed.water_depth || spot.water_depth,
    rocks: normalizeRocks(seed.rocks ?? seed.rocks_below ?? spot.rocks ?? spot.rocks_below),
    depth_known: seed.depth_known ?? spot.depth_known,
    entry_type: seed.entry_type || spot.entry_type,
    accessibility: seed.accessibility || spot.accessibility,
    waze_query: seed.waze_query || spot.waze_query || '',
    image_captions: seed.image_captions || spot.image_captions,
    ...(seed.location_approx === false
      ? { lat: seed.lat, lng: seed.lng, location_approx: false }
      : {}),
  };
}

function mergeSeedWithLocal(extraDeletedIds = []) {
  const local = read(LS_SPOTS);
  const seedIds = new Set(seedSpots.map((s) => s.id));
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
  return session;
}

function isMissingTableError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table')
  );
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

const MAX_JUMP_VIDEO_BYTES = 40 * 1024 * 1024;

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

function normalizeVideoComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    videoId: row.videoId || row.video_id,
    userId: row.userId || row.user_id,
    displayName: row.displayName || row.display_name || 'משתמש',
    text: row.text || '',
    createdAt: row.createdAt || row.created_at,
  };
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

export async function getJumpVideos(limit = 40) {
  const cloud = await tryCloudTable(async () => {
    const { data, error } = await supabase
      .from('jump_videos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  });
  const rows = (cloud || []).map(normalizeJumpVideo).filter((row) => row?.videoUrl);
  const visibleIds = new Set((await getAllSpots()).map((s) => String(s.id)));
  return rows.filter((row) => !row.spotId || visibleIds.has(String(row.spotId)));
}

export async function getJumpVideoComments(videoId) {
  if (!videoId) return [];
  const cloud = await tryCloudTable(async () => {
    const { data, error } = await supabase
      .from('jump_video_comments')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  });
  return (cloud || []).map(normalizeVideoComment).filter(Boolean);
}

export async function addJumpVideoComment(videoId, text) {
  const session = await requireUserSession();
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('כתבו תגובה');
  if (!useCloud()) throw new Error('צריך חיבור כדי להגיב');

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
    if (isMissingTableError(error)) {
      throw new Error('תגובות עדיין לא פעילות. נסו שוב מאוחר יותר.');
    }
    throw new Error(error.message || 'שליחת התגובה נכשלה');
  }
  return normalizeVideoComment(data);
}

export async function addJumpVideo({ spotId, spotName, caption = '', file }) {
  const session = await requireUserSession();
  if (!useCloud()) throw new Error('העלאת סרטונים דורשת חיבור.');
  if (!spotId) throw new Error('נא לתייג ספוט');
  if (!file) throw new Error('נא לבחור סרטון');
  if (!String(file.type || '').startsWith('video/')) {
    throw new Error('נא לבחור קובץ סרטון');
  }
  if (file.size > MAX_JUMP_VIDEO_BYTES) {
    throw new Error('הסרטון גדול מדי (עד 40MB).');
  }

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const path = `${session.user.id}/${uid()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('jump-videos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'video/mp4',
  });
  if (uploadError) {
    if (storageUnavailableError(uploadError)) {
      throw new Error('העלאת סרטונים עדיין לא פעילה. נסו שוב מאוחר יותר.');
    }
    throw new Error(uploadError.message || 'העלאת הסרטון נכשלה');
  }

  const { data: publicData } = supabase.storage.from('jump-videos').getPublicUrl(path);
  const videoUrl = publicData?.publicUrl;
  if (!videoUrl) {
    throw new Error('העלאת הסרטון נכשלה');
  }

  const row = {
    id: uid(),
    user_id: session.user.id,
    display_name: sessionDisplayName(session),
    spot_id: spotId,
    spot_name: spotName || 'ספוט',
    caption: String(caption || '').trim().slice(0, 200),
    video_url: videoUrl,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('jump_videos').insert(row).select().single();
  if (error) {
    await supabase.storage.from('jump-videos').remove([path]).catch(() => {});
    if (isMissingTableError(error)) {
      throw new Error('העלאת סרטונים עדיין לא פעילה. נסו שוב מאוחר יותר.');
    }
    throw new Error(error.message || 'שמירת הסרטון נכשלה');
  }
  return normalizeJumpVideo(data);
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
    active: users.filter((u) => u.status !== 'disabled').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
    admins: users.filter((u) => u.is_admin).length,
  };
}

export async function updateUserRole(userId, makeAdmin) {
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
      status === 'disabled' ? 'USER_DISABLED' : 'USER_REACTIVATED',
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
