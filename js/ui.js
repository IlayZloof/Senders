import { getSession, signOut, isAdmin, hasApprovedAccess, isWaitingAccess, getUnreadNotificationCount, buildLoginUrl } from './store.js';
import { prefetchReelsShellAndFeed } from './reels-prefetch.js';
import { initFooter } from './footer.js';
import { initThemeControl } from './theme.js';
import { applyDocumentLang, applyI18n, dateLocale, readLang, setLang, t } from './i18n.js';
import { displaySpotDescription, displaySpotHeightLabel } from './spot-locale.js';

const USERS_NAV_ID = 'navUsersLink';
const ADMIN_NAV_ID = 'navAdminLink';
const COMMUNITY_NAV_ID = 'navCommunityLink';
const TAB_ME_ID = 'tabBarMe';
const BRAND_LOGO_HTML = 'SEND<span>ERS</span>';
const CONTACT_HREF = 'contact.html';

const PRIMARY_NAV = [
  { href: 'index.html', labelKey: 'nav.home', id: 'home' },
  { href: 'map.html', labelKey: 'nav.map', id: 'map' },
  { href: 'community.html', labelKey: 'nav.community', id: 'community' },
  { href: 'add-spot.html', labelKey: 'nav.add', id: 'add' },
  { href: 'reels.html', labelKey: 'nav.reels', id: 'reels' },
  { href: 'profile.html', labelKey: 'nav.profile', id: 'me' },
];

const INFO_NAV = [
  { href: 'about.html', labelKey: 'nav.about' },
  { href: 'safety.html', labelKey: 'nav.safety' },
  { href: 'faq.html', labelKey: 'nav.faq' },
  { href: 'terms.html', labelKey: 'nav.terms' },
  { href: 'privacy.html', labelKey: 'nav.privacy' },
  { href: CONTACT_HREF, labelKey: 'nav.contact' },
];

const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const ICON_PEOPLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.4-3.2 2.8-5 5.5-5s5.1 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.2 14.2c2.2.3 4 1.8 4.3 4.8"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_REELS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="4"/><path d="m10 9.2 6 2.8-6 2.8V9.2z" fill="currentColor" stroke="none"/></svg>';
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

function isReelsPage() {
  return pageName().toLowerCase() === 'reels.html';
}

function injectReelsPrefetchLink() {
  if (isReelsPage()) return;
  if (document.querySelector('link[data-reels-prefetch]')) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'document';
  link.href = '/reels.html';
  link.dataset.reelsPrefetch = '1';
  document.head.appendChild(link);
}

function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 2500 });
    return;
  }
  window.setTimeout(fn, 400);
}

let reelsPrefetchScheduled = false;

function scheduleReelsPrefetch() {
  if (isReelsPage() || reelsPrefetchScheduled) return;
  if (!document.documentElement.classList.contains('access-granted')) return;
  reelsPrefetchScheduled = true;
  injectReelsPrefetchLink();
  whenIdle(() => {
    prefetchReelsShellAndFeed().catch(() => {});
  });
}

const ACCESS_OPEN_PAGES = new Set(['login.html', 'waiting.html']);

/**
 * Optimistic access hint. Every page used to stay behind the blank #accessGate
 * until Supabase answered the session + profile lookup (several round-trips to
 * Tokyo), which is why switching to Reels felt like a multi-second wait.
 * After a verified "approved" result we remember the user id for a while; on
 * the next page load, if the same Supabase user is still signed in locally,
 * the chrome is shown immediately and the real check still runs right after
 * (and re-locks / redirects if access was revoked). This is UI-only: data is
 * still protected by RLS and every loader still calls canUseSite().
 */
const ACCESS_HINT_KEY = 'senders_access_hint';
const ACCESS_HINT_TTL_MS = 6 * 60 * 60 * 1000;

function localAuthUserId() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!/^sb-.+-auth-token$/.test(key)) continue;
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      const id = data?.user?.id || data?.currentSession?.user?.id || '';
      if (id) return String(id);
    }
  } catch {
    /* ignore */
  }
  return '';
}

function writeAccessHint(userId) {
  try {
    if (userId) {
      localStorage.setItem(ACCESS_HINT_KEY, JSON.stringify({ uid: String(userId), ts: Date.now() }));
    } else {
      localStorage.removeItem(ACCESS_HINT_KEY);
    }
  } catch {
    /* ignore */
  }
}

function hasFreshAccessHint() {
  try {
    const hint = JSON.parse(localStorage.getItem(ACCESS_HINT_KEY) || 'null');
    if (!hint?.uid || !Number.isFinite(hint.ts)) return false;
    if (Date.now() - hint.ts > ACCESS_HINT_TTL_MS) return false;
    return hint.uid === localAuthUserId();
  } catch {
    return false;
  }
}

function isAccessOpenPage() {
  return ACCESS_OPEN_PAGES.has(pageName().toLowerCase());
}

function hrefPageFile(href) {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return '';
    let file = (url.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (!file || file === '/' || file === 'index') return 'index.html';
    if (!file.endsWith('.html')) file = `${file}.html`;
    return file;
  } catch {
    return '';
  }
}

function mountAccessOverlay(waiting) {
  let el = document.getElementById('accessGate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'accessGate';
    el.innerHTML = `
      <div class="access-wait-card">
        <p class="access-wait-title">${t('wait.title')}</p>
        <p class="access-wait-lead">${t('wait.lead')}</p>
      </div>
    `;
    document.documentElement.appendChild(el);
  }
  el.classList.toggle('is-waiting', Boolean(waiting));
}

function removeAccessOverlay() {
  document.getElementById('accessGate')?.remove();
}

function bindAccessClickGuard() {
  if (window.__sendersAccessGuard) return;
  window.__sendersAccessGuard = true;
  document.addEventListener('click', (e) => {
    const locked = document.documentElement.classList.contains('access-lock')
      || document.documentElement.classList.contains('access-waiting');
    if (!locked) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const file = hrefPageFile(href);
    if (file && ACCESS_OPEN_PAGES.has(file)) return;
    e.preventDefault();
    e.stopPropagation();
    const waiting = document.documentElement.classList.contains('access-waiting');
    window.location.replace(waiting ? 'waiting.html' : 'login.html');
  }, true);
}

function applyAccessChrome(session) {
  const admin = Boolean(session?.profile && isAdmin(session.profile, session.user));
  const approved = admin || hasApprovedAccess(session?.profile, session?.user);
  const waiting = isWaitingAccess(session?.profile, session?.user);
  const root = document.documentElement;

  if (approved) {
    if (session?.accessToken && session?.user?.id) writeAccessHint(session.user.id);
    root.classList.remove('access-lock', 'access-waiting', 'hide-app-nav');
    root.classList.add('access-granted');
    removeAccessOverlay();
    ensureTabBar();
    initFooter();
    scheduleReelsPrefetch();
    return;
  }

  writeAccessHint('');
  root.classList.remove('access-granted');
  document.getElementById('tabBar')?.remove();
  root.classList.add('hide-app-nav');
  root.classList.toggle('access-waiting', waiting);
  if (!isAccessOpenPage()) {
    root.classList.add('access-lock');
    mountAccessOverlay(waiting);
  } else {
    root.classList.remove('access-lock');
    removeAccessOverlay();
  }
}

function enforceAccessGate(session) {
  const page = pageName().toLowerCase();
  const admin = Boolean(session?.profile && isAdmin(session.profile, session.user));
  applyAccessChrome(session);
  if (admin) {
    if (page === 'waiting.html') window.location.replace('admin.html');
    return;
  }
  if (isWaitingAccess(session?.profile, session?.user)) {
    if (page !== 'waiting.html' && page !== 'login.html') {
      window.location.replace('waiting.html');
    }
    return;
  }
  if (!session) {
    if (!ACCESS_OPEN_PAGES.has(page)) {
      // buildLoginUrl() takes pathname+search once and never wraps a login/waiting URL
      window.location.replace(buildLoginUrl());
    }
    return;
  }
  if (hasApprovedAccess(session.profile, session.user) && page === 'waiting.html') {
    window.location.replace('index.html');
  }
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

function ensureNavBackdrop() {
  let el = document.getElementById('navBackdrop');
  if (el) return el;
  el = document.createElement('button');
  el.type = 'button';
  el.id = 'navBackdrop';
  el.className = 'nav-backdrop';
  el.setAttribute('aria-label', t('nav.menu'));
  el.tabIndex = -1;
  document.body.appendChild(el);
  return el;
}

export function initNav() {
  applyDocumentLang();
  ensureBrandLogo();
  registerServiceWorker();
  scheduleReelsPrefetch();
  if (isStandalonePwa()) document.documentElement.classList.add('pwa-standalone');

  const optimistic = !isAccessOpenPage() && hasFreshAccessHint();
  if (optimistic) {
    document.documentElement.classList.add('access-granted');
  } else {
    document.documentElement.classList.add('hide-app-nav');
  }
  if (isAccessOpenPage()) {
    document.documentElement.classList.add('access-open');
  } else if (!optimistic) {
    document.documentElement.classList.add('access-lock');
    mountAccessOverlay(false);
  }
  bindAccessClickGuard();

  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  ensureDesktopPrimaryNav();
  ensureInfoNavLinks();
  const panel = wrapNavPanel(nav, links, document.getElementById('authArea'));
  const backdrop = ensureNavBackdrop();
  if (isAccessOpenPage()) {
    document.getElementById('tabBar')?.remove();
  }
  ensureNavAvatar();
  initThemeControl();
  ensureNavTitle();

  const closeMenu = () => {
    panel?.classList.remove('open');
    links?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  const openMenu = () => {
    document.getElementById('mapSearchSuggest')?.classList.remove('is-open');
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
  toggle?.setAttribute('aria-label', t('nav.menu'));
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel?.classList.contains('open')) closeMenu();
    else openMenu();
  });

  panel?.addEventListener('click', (e) => {
    if (e.target.closest('[data-set-lang], .nav-lang-toggle')) return;
    if (e.target.closest('a, button')) closeMenu();
  });

  backdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (!panel?.classList.contains('open')) return;
    if (nav?.contains(e.target)) return;
    closeMenu();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  if (optimistic) {
    ensureTabBar();
    initFooter();
    scheduleReelsPrefetch();
  }

  updateAuthUI().finally(() => highlightTabBar());
  window.addEventListener('pageshow', highlightTabBar);
  applyI18n();
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
  if (id === 'reels') return tab === 'reels';
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
  primary.setAttribute('aria-label', t('nav.primary'));
  primary.innerHTML = PRIMARY_NAV.map((item) => (
    navItemHtml(item.href, t(item.labelKey), isPrimaryActive(item.id))
  )).join('');

  const communityItem = [...primary.children].find((li) => li.querySelector('a[href*="community"]'));
  if (communityItem) communityItem.id = COMMUNITY_NAV_ID;
}

function ensureInfoNavLinks() {
  const links = document.getElementById('navLinks');
  if (!links) return;

  const file = pageName().toLowerCase();
  links.className = 'nav-links nav-links-info';
  links.setAttribute('aria-label', t('nav.info'));
  const lang = readLang();
  links.innerHTML = `${INFO_NAV.map((item) => {
    const hrefFile = item.href.split('/').pop().toLowerCase();
    const active = Boolean(hrefFile && !item.href.startsWith('mailto:') && !item.href.startsWith('http') && file === hrefFile);
    return navItemHtml(item.href, t(item.labelKey), active);
  }).join('')}
    <li class="nav-lang">
      <button type="button" class="nav-lang-toggle" id="navLangToggle" aria-expanded="false" aria-controls="navLangMenu">${t('nav.language')}</button>
      <div class="nav-lang-menu" id="navLangMenu" hidden>
        <button type="button" data-set-lang="he" class="${lang === 'he' ? 'is-active' : ''}" aria-pressed="${lang === 'he' ? 'true' : 'false'}">עברית</button>
        <button type="button" data-set-lang="en" class="${lang === 'en' ? 'is-active' : ''}" aria-pressed="${lang === 'en' ? 'true' : 'false'}">English</button>
      </div>
    </li>`;

  const toggleLang = document.getElementById('navLangToggle');
  const langMenu = document.getElementById('navLangMenu');
  toggleLang?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = langMenu?.hasAttribute('hidden') ?? true;
    if (open) langMenu?.removeAttribute('hidden');
    else langMenu?.setAttribute('hidden', '');
    toggleLang.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.querySelectorAll('[data-set-lang]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLang(btn.getAttribute('data-set-lang'));
    });
  });
}

const TAB_STORAGE = 'senders_tab';

function pageName() {
  const path = window.location.pathname.replace(/\/+$/, '');
  let file = (path.split('/').pop() || '').toLowerCase();
  if (!file || file === 'index' || file === 'index.html') return 'index.html';
  if (!file.endsWith('.html')) file = `${file}.html`;
  return file;
}

function tabIdFromLocation() {
  const file = pageName().toLowerCase();
  if (file.includes('map')) return 'map';
  if (file.includes('community')) return 'community';
  if (file.includes('add-spot') || file.includes('addspot')) return 'add';
  if (file.includes('reels')) return 'reels';
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
  if (document.documentElement.classList.contains('access-waiting')
    || document.documentElement.classList.contains('access-lock')
    || (document.documentElement.classList.contains('hide-app-nav')
      && !document.documentElement.classList.contains('access-granted'))) {
    return;
  }
  if (document.getElementById('tabBar')) return;

  const bar = document.createElement('nav');
  bar.id = 'tabBar';
  bar.className = 'tab-bar';
  bar.setAttribute('aria-label', t('nav.primary'));
  bar.innerHTML = `
    <a href="index.html" data-tab="home">${ICON_HOME}<span>${t('tab.home')}</span></a>
    <a href="map.html" data-tab="map">${ICON_PIN}<span>${t('tab.map')}</span></a>
    <a href="community.html" data-tab="community">${ICON_PEOPLE}<span>${t('tab.community')}</span></a>
    <a href="add-spot.html" data-tab="add">${ICON_PLUS}<span>${t('tab.add')}</span></a>
    <a href="reels.html" data-tab="reels">${ICON_REELS}<span>${t('tab.reels')}</span></a>
    <a href="profile.html" data-tab="me" id="${TAB_ME_ID}">${ICON_PERSON}<span>${t('tab.profile')}</span></a>
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

function isTextFieldFocused() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = String(el.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'hidden', 'range', 'color'].includes(type);
}

function keyboardOverlapPx() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const layoutH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  return Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop));
}

function syncKeyboardChrome() {
  const bar = document.getElementById('tabBar');
  const focused = isTextFieldFocused();
  const overlap = keyboardOverlapPx();
  const keyboardOpen = focused || overlap > 80;
  document.documentElement.classList.toggle('keyboard-open', keyboardOpen);
  if (bar) {
    bar.setAttribute('aria-hidden', keyboardOpen ? 'true' : 'false');
  }
}

function initTabBarViewportLock() {
  if (initTabBarViewportLock.bound) return;
  initTabBarViewportLock.bound = true;

  let frame = 0;
  let pollId = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncKeyboardChrome();
    });
  };
  const startPoll = () => {
    if (pollId) return;
    pollId = window.setInterval(syncKeyboardChrome, 80);
  };
  const stopPoll = () => {
    if (!pollId) return;
    window.clearInterval(pollId);
    pollId = 0;
  };

  syncKeyboardChrome();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('focusin', () => {
    syncKeyboardChrome();
    if (isTextFieldFocused()) startPoll();
  });
  document.addEventListener('focusout', () => {
    window.setTimeout(() => {
      syncKeyboardChrome();
      if (isTextFieldFocused()) startPoll();
      else stopPoll();
    }, 80);
  });
  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
  }
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

function updateTabBarMe(admin) {
  const item = document.getElementById(TAB_ME_ID);
  if (!item) return;

  if (admin) {
    item.href = 'admin.html';
    item.innerHTML = `${ICON_USERS}<span>${t('tab.admin')}</span>`;
  } else {
    item.href = 'profile.html';
    item.innerHTML = `${ICON_PERSON}<span>${t('tab.profile')}</span>`;
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
  wrap.innerHTML = `<a href="login.html" class="nav-avatar is-guest" id="navAvatar" aria-label="${t('nav.login')}"><img src="${DEFAULT_AVATAR}" alt="" class="nav-avatar-dummy"></a>`;
  nav.appendChild(wrap);
  return wrap;
}

function ensureNavTitle() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const existing = document.getElementById('navTitle');
  if (existing) {
    existing.textContent = t('nav.title');
    return;
  }

  const title = document.createElement('a');
  title.id = 'navTitle';
  title.className = 'nav-title';
  title.href = 'index.html';
  title.textContent = t('nav.title');

  const toggle = document.getElementById('navToggle');
  if (toggle) nav.insertBefore(title, toggle);
  else nav.appendChild(title);
}

function isGooglePhoto(url) {
  return /googleusercontent\.com|ggpht\.com|lh\d\.google\.com/i.test(String(url || ''));
}

export function profileAvatarSrc(profile) {
  const src = safePhotoSrc(
    profile?.avatar_url ||
    profile?.photo_url ||
    profile?.avatar ||
    profile?.photo ||
    profile?.image ||
    ''
  );
  if (!src || isGooglePhoto(src)) return '';
  return src;
}

function profilePhotoSrc(session) {
  return profileAvatarSrc(session?.profile);
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
    adminLink.innerHTML = `${t('nav.admin')}${unread ? `<span class="nav-badge">${unread}</span>` : ''}`;
  } else {
    adminLink?.remove();
  }

  const avatar = document.getElementById('navAvatar');
  if (!avatar) return;
  const loggedIn = Boolean(session?.profile);
  avatar.href = loggedIn ? 'profile.html' : 'login.html';
  avatar.setAttribute('aria-label', loggedIn ? t('nav.profile') : t('nav.login'));
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
  const adminNav = upsertPrimaryNavItem(ADMIN_NAV_ID, 'admin.html', t('nav.admin'), profileItem);
  const usersNav = upsertPrimaryNavItem(USERS_NAV_ID, 'users.html', t('nav.users'), profileItem);

  adminNav?.querySelector('a')?.classList.toggle('active', /admin\.html$/i.test(window.location.pathname));
  usersNav?.querySelector('a')?.classList.toggle('active', /users\.html$/i.test(window.location.pathname));
}

export async function updateAuthUI() {
  const session = await getSession();
  enforceAccessGate(session);
  const authArea = document.getElementById('authArea');
  const admin = Boolean(session?.profile && isAdmin(session.profile, session.user));
  updateAdminNavLink(admin);
  updateTabBarMe(admin);
  const unread = admin ? await getUnreadNotificationCount() : 0;
  updateNavAvatar(session, admin, unread);

  document.body.classList.toggle('is-authed', Boolean(session?.profile));
  document.body.classList.toggle('is-admin', admin);

  if (!authArea) return;

  if (session?.profile) {
    const name = session.profile.display_name || t('nav.user');
    authArea.innerHTML = `
      ${admin ? `<a href="admin.html" class="nav-admin">${t('nav.admin')}${unread ? `<span class="nav-badge">${unread}</span>` : ''}</a>` : ''}
      <a href="profile.html" class="nav-user">${name}</a>
      <button class="btn btn-ghost btn-sm nav-logout" id="logoutBtn">${t('nav.logout')}</button>
    `;
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
  } else {
    authArea.innerHTML = `
      <a href="login.html" class="btn btn-ghost btn-sm">${t('nav.login')}</a>
      <a href="login.html?mode=signup" class="btn btn-primary btn-sm">${t('nav.signup')}</a>
    `;
  }
}

export function requireAdmin() {
  return getSession().then((session) => {
    if (!session) {
      window.location.href = buildLoginUrl();
      return null;
    }
    if (!isAdmin(session.profile, session.user)) {
      window.location.href = isWaitingAccess(session.profile, session.user) ? 'waiting.html' : 'map.html';
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

export function requireAuth(message = t('auth.required')) {
  return getSession().then((session) => {
    if (!session) {
      window.location.href = buildLoginUrl();
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
      <span>${t('guest.watch')}</span>
      <a href="login.html">${t('guest.login')}</a>${t('guest.after')}
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
  return new Date(iso).toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(dateLocale(), {
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
  return `<p class="spot-reel-link"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${t('spot.reel')}</a></p>`;
}

export function spotBriefHtml(spot, instagramUrl, { headingTag = 'h2', bodyClass = 'spot-desc' } = {}) {
  const desc = plainSpotDescription(displaySpotDescription(spot));
  const reel = spotReelLinkHtml(instagramUrl);
  if (!desc && !reel) return '';
  return `
    <${headingTag} class="spot-desc-heading">${t('spot.brief')}</${headingTag}>
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
  const custom = displaySpotHeightLabel(spot);
  if (custom) return custom;
  const min = Number(spot?.height_min);
  const max = Number(spot?.height_max);
  const prefix = spot?.height_estimated ? t('height.estimated') : '';
  const unit = t('height.m');
  if ((!min && !max) || (min === 0 && max === 0)) return t('height.none');
  if (!min || min === max) return `${prefix}${max}${unit}`;
  if (!max) return `${prefix}${min}${unit}`;
  return `${prefix}${min}–${max}${unit}`;
}

export function wazeNavUrl(lat, lng, query) {
  const q = String(query || '').trim();
  if (/^https?:\/\/(www\.)?waze\.com\//i.test(q)) return q;
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
