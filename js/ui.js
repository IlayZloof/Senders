import { getSession, signOut, isAdmin, getUnreadNotificationCount } from './store.js';
import { initFooter } from './footer.js';

const USERS_NAV_ID = 'navUsersLink';
const ADMIN_NAV_ID = 'navAdminLink';
const COMMUNITY_NAV_ID = 'navCommunityLink';
const TAB_ME_ID = 'tabBarMe';
const BRAND_LOGO_HTML = 'SEND<span>ERS</span>';
const CONTACT_HREF = 'contact.html';

const PRIMARY_NAV = [
  { href: 'index.html', label: 'בית', id: 'home' },
  { href: 'map.html', label: 'מפה', id: 'map' },
  { href: 'community.html', label: 'קהילה', id: 'community' },
  { href: 'add-spot.html', label: 'הוספת ספוט', id: 'add' },
  { href: 'profile.html', label: 'פרופיל', id: 'me' },
];

const INFO_NAV = [
  { href: 'about.html', label: 'קצת עליי' },
  { href: 'safety.html', label: 'בטיחות' },
  { href: 'faq.html', label: 'שאלות נפוצות' },
  { href: 'terms.html', label: 'תנאי שימוש' },
  { href: 'privacy.html', label: 'מדיניות פרטיות' },
  { href: CONTACT_HREF, label: 'צור קשר' },
];

const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const ICON_PEOPLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.4-3.2 2.8-5 5.5-5s5.1 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.2 14.2c2.2.3 4 1.8 4.3 4.8"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8.5" r="2.8"/><circle cx="16" cy="8.5" r="2.8"/><path d="M3.2 19c.5-2.8 2.5-4.4 4.8-4.4s4.3 1.6 4.8 4.4"/><path d="M11.2 19c.5-2.8 2.5-4.4 4.8-4.4s4.3 1.6 4.8 4.4"/></svg>';
const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.6-3.8 3.2-6 7-6s6.4 2.2 7 6"/></svg>';
const DEFAULT_AVATAR = '/icons/avatar-default.svg';

/** Force Senders two-tone logo on all nav/footer brand slots (guards stale HTML/cache). */
function ensureBrandLogo() {
  document.querySelectorAll('.nav-logo').forEach((el) => {
    const text = el.textContent.replace(/\s/g, '').toLowerCase();
    if (text !== 'senders') {
      el.innerHTML = BRAND_LOGO_HTML;
    }
  });
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function wrapNavPanel(nav, links, auth) {
  if (!nav || !links) return null;
  const existing = nav.querySelector('.nav-panel');
  if (existing) return existing;
  const panel = document.createElement('div');
  panel.className = 'nav-panel';
  panel.id = 'navPanel';
  links.before(panel);
  panel.appendChild(links);
  if (auth) panel.appendChild(auth);
  return panel;
}

export function initNav() {
  ensureBrandLogo();
  registerServiceWorker();
  if (isStandalonePwa()) document.documentElement.classList.add('pwa-standalone');

  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  ensureDesktopPrimaryNav();
  ensureInfoNavLinks();
  const panel = wrapNavPanel(nav, links, document.getElementById('authArea'));
  ensureTabBar();
  ensureNavAvatar();
  ensureNavTitle();

  const closeMenu = () => {
    panel?.classList.remove('open');
    links?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  const openMenu = () => {
    panel?.classList.add('open');
    links?.classList.add('open');
    toggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  };

  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 50);
  });

  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-controls', 'navPanel');
  toggle?.setAttribute('aria-label', 'תפריט מידע');
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel?.classList.contains('open')) closeMenu();
    else openMenu();
  });

  panel?.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (!panel?.classList.contains('open')) return;
    if (nav?.contains(e.target)) return;
    closeMenu();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  updateAuthUI().finally(() => highlightTabBar());
  window.addEventListener('pageshow', highlightTabBar);
  initTabSwipe();
  initFooter();
}

function navItemHtml(href, label, active) {
  const current = active ? ' class="active" aria-current="page"' : '';
  return `<li><a href="${href}"${current}>${label}</a></li>`;
}

function isPrimaryActive(id) {
  const tab = tabIdFromLocation();
  if (id === 'home') return tab === 'home';
  if (id === 'map') return tab === 'map';
  if (id === 'community') return tab === 'community';
  if (id === 'add') return tab === 'add';
  if (id === 'me') return tab === 'me';
  return false;
}

function ensureDesktopPrimaryNav() {
  const nav = document.getElementById('nav');
  const info = document.getElementById('navLinks');
  if (!nav || !info) return;

  let primary = document.getElementById('navLinksPrimary');
  if (!primary) {
    primary = document.createElement('ul');
    primary.id = 'navLinksPrimary';
    info.before(primary);
  }
  primary.className = 'nav-links nav-links-primary';
  primary.setAttribute('aria-label', 'ניווט ראשי');
  primary.innerHTML = PRIMARY_NAV.map((item) => (
    navItemHtml(item.href, item.label, isPrimaryActive(item.id))
  )).join('');

  const communityItem = [...primary.children].find((li) => li.querySelector('a[href*="community"]'));
  if (communityItem) communityItem.id = COMMUNITY_NAV_ID;
}

function ensureInfoNavLinks() {
  const links = document.getElementById('navLinks');
  if (!links) return;

  const file = pageName().toLowerCase();
  links.className = 'nav-links nav-links-info';
  links.setAttribute('aria-label', 'מידע ומשפטי');
  links.innerHTML = INFO_NAV.map((item) => {
    const hrefFile = item.href.split('/').pop().toLowerCase();
    const active = Boolean(hrefFile && !item.href.startsWith('mailto:') && !item.href.startsWith('http') && file === hrefFile);
    return navItemHtml(item.href, item.label, active);
  }).join('');
}

const TAB_STORAGE = 'senders_tab';
const TAB_ORDER = ['home', 'map', 'community', 'add', 'me'];
const SWIPE_IGNORE = [
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable="true"]',
  '.leaflet-container',
  '.map-container',
  '.mini-map-wrap',
  '.spot-slider',
  '.tab-bar',
  'dialog',
  '.modal',
  '.home-sheet',
  '.home-plus',
].join(', ');

function pageName() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const file = path.split('/').pop() || '';
  if (!file || file === 'index.html') return 'index.html';
  return file;
}

function tabIdFromLocation() {
  const file = pageName().toLowerCase();
  if (file.includes('map')) return 'map';
  if (file.includes('community')) return 'community';
  if (file.includes('add-spot') || file.includes('addspot')) return 'add';
  if (file.includes('profile') || file.includes('users') || file.includes('admin')) return 'me';
  if (file.includes('spot')) return 'map';
  if (!file || file === 'index.html' || file === 'index') return 'home';
  return '';
}

function rememberTab(tab) {
  if (!tab) return;
  try {
    sessionStorage.setItem(TAB_STORAGE, tab);
  } catch {
    /* ignore */
  }
}

function ensureTabBar() {
  if (document.getElementById('tabBar')) return;

  const bar = document.createElement('nav');
  bar.id = 'tabBar';
  bar.className = 'tab-bar';
  bar.setAttribute('aria-label', 'ניווט ראשי');
  bar.innerHTML = `
    <a href="index.html" data-tab="home">${ICON_HOME}<span>בית</span></a>
    <a href="map.html" data-tab="map">${ICON_PIN}<span>מפה</span></a>
    <a href="community.html" data-tab="community">${ICON_PEOPLE}<span>קהילה</span></a>
    <a href="add-spot.html" data-tab="add">${ICON_PLUS}<span>הוספת ספוט</span></a>
    <a href="profile.html" data-tab="me" id="${TAB_ME_ID}">${ICON_PERSON}<span>פרופיל</span></a>
  `;
  document.body.appendChild(bar);
  highlightTabBar();
  initTabBarViewportLock();

  const paintTab = (link) => {
    if (!link || !bar.contains(link)) return;
    paintTabId(link.dataset.tab);
  };

  bar.addEventListener('pointerdown', (e) => {
    paintTab(e.target.closest('a'));
  });
  bar.addEventListener('touchstart', (e) => {
    paintTab(e.target.closest('a'));
  }, { passive: true });
  bar.addEventListener('click', (e) => {
    paintTab(e.target.closest('a'));
  });
}

function paintTabId(tab) {
  const bar = document.getElementById('tabBar');
  if (!bar || !tab) return;
  rememberTab(tab);
  bar.querySelectorAll('a[data-tab]').forEach((item) => {
    const on = item.dataset.tab === tab;
    item.classList.toggle('active', on);
    if (on) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function pinTabBarToLayoutViewport() {
  const bar = document.getElementById('tabBar');
  if (!bar || getComputedStyle(bar).display === 'none') return;

  const vv = window.visualViewport;
  if (!vv) {
    bar.style.setProperty('--tab-bar-vv-shift', '0px');
    return;
  }

  const layoutH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  const gap = Math.round(layoutH - vv.height - vv.offsetTop);
  bar.style.setProperty('--tab-bar-vv-shift', `${gap > 1 ? gap : 0}px`);
}

function initTabBarViewportLock() {
  if (initTabBarViewportLock.bound) return;
  initTabBarViewportLock.bound = true;

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      pinTabBarToLayoutViewport();
    });
  };

  pinTabBarToLayoutViewport();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
  }
}

function highlightTabBar() {
  const bar = document.getElementById('tabBar');
  if (!bar) return;

  let active = tabIdFromLocation();
  if (!active) {
    try {
      active = sessionStorage.getItem(TAB_STORAGE) || '';
    } catch {
      active = '';
    }
  }
  paintTabId(active);
}

function hrefForTab(tab) {
  const bar = document.getElementById('tabBar');
  const link = bar?.querySelector(`a[data-tab="${tab}"]`);
  const href = link?.getAttribute('href');
  if (href) return href;
  return {
    home: 'index.html',
    map: 'map.html',
    community: 'community.html',
    add: 'add-spot.html',
    me: 'profile.html',
  }[tab] || '';
}

function goAdjacentTab(delta) {
  const current = tabIdFromLocation();
  if (!current) return false;
  const index = TAB_ORDER.indexOf(current);
  if (index < 0) return false;
  const next = TAB_ORDER[index + delta];
  if (!next) return false;
  const href = hrefForTab(next);
  if (!href) return false;
  paintTabId(next);
  window.location.href = href;
  return true;
}

function initTabSwipe() {
  const EDGE = 28;
  const MIN_DX = 64;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let navigating = false;

  const canSwipe = () => (
    !navigating
    && window.matchMedia('(max-width: 768px)').matches
    && !!document.getElementById('tabBar')
    && !!tabIdFromLocation()
    && !document.body.classList.contains('nav-open')
    && !document.body.classList.contains('sheet-open')
  );

  document.addEventListener('touchstart', (e) => {
    tracking = false;
    if (!canSwipe() || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const x = touch.clientX;
    if (x < EDGE || x > window.innerWidth - EDGE) return;
    if (e.target.closest(SWIPE_IGNORE)) return;
    startX = x;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking || navigating) {
      tracking = false;
      return;
    }
    tracking = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < MIN_DX) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const delta = dx < 0 ? 1 : -1;
    navigating = goAdjacentTab(delta);
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    tracking = false;
  }, { passive: true });
}

function updateTabBarMe(admin) {
  const item = document.getElementById(TAB_ME_ID);
  if (!item) return;

  if (admin) {
    item.href = 'admin.html';
    item.innerHTML = `${ICON_USERS}<span>ניהול</span>`;
  } else {
    item.href = 'profile.html';
    item.innerHTML = `${ICON_PERSON}<span>פרופיל</span>`;
  }
  highlightTabBar();
}

function ensureNavAvatar() {
  const nav = document.getElementById('nav');
  if (!nav) return null;
  let wrap = document.getElementById('navAvatarWrap');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.id = 'navAvatarWrap';
  wrap.className = 'nav-avatar-wrap';
  wrap.innerHTML = `<a href="login.html" class="nav-avatar is-guest" id="navAvatar" aria-label="התחברות"><img src="${DEFAULT_AVATAR}" alt="" class="nav-avatar-dummy"></a>`;
  nav.appendChild(wrap);
  return wrap;
}

function ensureNavTitle() {
  const nav = document.getElementById('nav');
  if (!nav || document.getElementById('navTitle')) return;

  const title = document.createElement('a');
  title.id = 'navTitle';
  title.className = 'nav-title';
  title.href = 'index.html';
  title.textContent = 'קהילת קופצי הצוקים בישראל';

  const toggle = document.getElementById('navToggle');
  if (toggle) nav.insertBefore(title, toggle);
  else nav.appendChild(title);
}

function isGooglePhoto(url) {
  return /googleusercontent\.com|ggpht\.com|lh\d\.google\.com/i.test(String(url || ''));
}

function profilePhotoSrc(session) {
  const profile = session?.profile || {};
  const src = safePhotoSrc(
    profile.avatar_url ||
    profile.avatar ||
    profile.photo ||
    profile.image ||
    ''
  );
  if (!src || isGooglePhoto(src)) return '';
  return src;
}

function avatarInnerHtml(session) {
  const photo = session?.profile ? profilePhotoSrc(session) : '';
  const src = photo || DEFAULT_AVATAR;
  return `<img src="${escapeHtml(src)}" alt="" class="${photo ? 'nav-avatar-photo' : 'nav-avatar-dummy'}">`;
}

function updateNavAvatar(session, admin, unread = 0) {
  const wrap = ensureNavAvatar();
  if (!wrap) return;

  let adminLink = wrap.querySelector('.nav-admin-compact');
  if (admin) {
    if (!adminLink) {
      adminLink = document.createElement('a');
      adminLink.href = 'admin.html';
      adminLink.className = 'nav-admin nav-admin-compact';
      wrap.insertBefore(adminLink, wrap.firstChild);
    }
    adminLink.innerHTML = `ניהול${unread ? `<span class="nav-badge">${unread}</span>` : ''}`;
  } else {
    adminLink?.remove();
  }

  const avatar = document.getElementById('navAvatar');
  if (!avatar) return;
  const loggedIn = Boolean(session?.profile);
  avatar.href = loggedIn ? 'profile.html' : 'login.html';
  avatar.setAttribute('aria-label', loggedIn ? 'פרופיל' : 'התחברות');
  avatar.classList.toggle('is-guest', !loggedIn);
  avatar.classList.toggle('has-photo', Boolean(loggedIn && profilePhotoSrc(session)));
  avatar.innerHTML = avatarInnerHtml(session);
}

function upsertPrimaryNavItem(id, href, label, beforeEl) {
  const links = document.getElementById('navLinksPrimary');
  if (!links) return null;
  let item = document.getElementById(id);
  if (!item) {
    item = document.createElement('li');
    item.id = id;
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    item.appendChild(link);
    if (beforeEl) links.insertBefore(item, beforeEl);
    else links.appendChild(item);
  }
  return item;
}

function updateAdminNavLink(admin) {
  const links = document.getElementById('navLinksPrimary');
  if (!links) return;

  const usersItem = document.getElementById(USERS_NAV_ID);
  const adminItem = document.getElementById(ADMIN_NAV_ID);
  if (!admin) {
    usersItem?.remove();
    adminItem?.remove();
    return;
  }

  const profileItem = [...links.children].find((li) => li.querySelector('a[href*="profile"]'));
  const adminNav = upsertPrimaryNavItem(ADMIN_NAV_ID, 'admin.html', 'ניהול', profileItem);
  const usersNav = upsertPrimaryNavItem(USERS_NAV_ID, 'users.html', 'משתמשים', profileItem);

  adminNav?.querySelector('a')?.classList.toggle('active', /admin\.html$/i.test(window.location.pathname));
  usersNav?.querySelector('a')?.classList.toggle('active', /users\.html$/i.test(window.location.pathname));
}

export async function updateAuthUI() {
  const session = await getSession();
  const authArea = document.getElementById('authArea');
  const admin = Boolean(session?.profile && isAdmin(session.profile, session.user));
  updateAdminNavLink(admin);
  updateTabBarMe(admin);
  const unread = admin ? await getUnreadNotificationCount() : 0;
  updateNavAvatar(session, admin, unread);

  if (!authArea) return;

  if (session?.profile) {
    const name = session.profile.display_name || 'משתמש';
    authArea.innerHTML = `
      ${admin ? `<a href="admin.html" class="nav-admin">ניהול${unread ? `<span class="nav-badge">${unread}</span>` : ''}</a>` : ''}
      <a href="profile.html" class="nav-user">${name}</a>
      <button class="btn btn-ghost btn-sm nav-logout" id="logoutBtn">יציאה</button>
    `;
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
  } else {
    authArea.innerHTML = `
      <a href="login.html" class="btn btn-ghost btn-sm">התחברות</a>
      <a href="login.html?mode=signup" class="btn btn-primary btn-sm">הרשמה</a>
    `;
  }
}

export function requireAdmin() {
  return getSession().then((session) => {
    if (!session) {
      const params = new URLSearchParams({ redirect: window.location.pathname + window.location.search });
      window.location.href = `login.html?${params}`;
      return null;
    }
    if (!isAdmin(session.profile, session.user)) {
      window.location.href = 'map.html';
      return null;
    }
    return session;
  });
}

export function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const masked = local.length <= 1 ? `${local}***` : `${local[0]}***${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

export function requireAuth(message = 'צריך להתחבר כדי לבצע פעולה זו') {
  return getSession().then((session) => {
    if (!session) {
      const params = new URLSearchParams({ redirect: window.location.pathname + window.location.search });
      window.location.href = `login.html?${params}`;
      return null;
    }
    return session;
  });
}

export function showGuestBanner(containerId = 'guestBanner') {
  getSession().then((session) => {
    const el = document.getElementById(containerId);
    if (!el || session) return;
    el.hidden = false;
    el.innerHTML = `
      <span>👀 אתה במצב צפייה בלבד</span>
      <a href="login.html">התחבר</a> כדי להוסיף ספוטים, לשתף מהשטח ולרשום קפיצות.
    `;
  });
}

export function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
  );

  reveals.forEach((el) => observer.observe(el));
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip leftover HTML (e.g. inline reel anchors) from seed/DB descriptions. */
export function plainSpotDescription(text) {
  return String(text || '')
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shared reel link below «בקצרה על המקום». Empty if the spot has no Instagram URL. */
export function spotReelLinkHtml(url) {
  const href = String(url || '').trim();
  if (!href) return '';
  return `<p class="spot-reel-link"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">קישור לסרטון</a></p>`;
}

export function spotBriefHtml(spot, instagramUrl, { headingTag = 'h2', bodyClass = 'spot-desc' } = {}) {
  const desc = plainSpotDescription(spot?.description);
  const reel = spotReelLinkHtml(instagramUrl);
  if (!desc && !reel) return '';
  return `
    <${headingTag} class="spot-desc-heading">בקצרה על המקום</${headingTag}>
    ${desc ? `<p class="${bodyClass}">${escapeHtml(desc)}</p>` : ''}
    ${reel}
  `;
}

export function safePhotoSrc(src) {
  if (!src) return '';
  const value = String(src);
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https:\/\//i.test(value) || /^http:\/\//i.test(value)) return value;
  return '';
}

export function heightLabel(spot) {
  const min = Number(spot?.height_min);
  const max = Number(spot?.height_max);
  const prefix = spot?.height_estimated ? 'כ־' : '';
  if ((!min && !max) || (min === 0 && max === 0)) return 'גובה לא צוין';
  if (!min || min === max) return `${prefix}${max}מ׳`;
  if (!max) return `${prefix}${min}מ׳`;
  return `${prefix}${min}–${max}מ׳`;
}

export function wazeNavUrl(lat, lng, query) {
  const q = String(query || '').trim();
  if (q) {
    return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
  }
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function googleMapsNavUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function stars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}
