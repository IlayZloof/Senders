import { t } from './i18n.js';

const STORAGE_KEY = 'senders-theme';
const MODES = ['dark', 'light', 'auto'];

function themeLabels() {
  return {
    dark: t('theme.dark'),
    light: t('theme.light'),
    auto: t('theme.auto'),
  };
}

const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v1.6M12 19.4V21M4.2 4.2l1.1 1.1M18.7 18.7l1.1 1.1M3 12h1.6M19.4 12H21M4.2 19.8l1.1-1.1M18.7 5.3l1.1-1.1"/></svg>';
const ICON_AUTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16V4z" fill="currentColor" stroke="none"/></svg>';

const ICONS = { dark: ICON_MOON, light: ICON_SUN, auto: ICON_AUTO };

export function readThemeMode() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'auto' || stored === 'dark') return stored;
  return 'dark';
}

export function resolveTheme(mode = readThemeMode()) {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode === 'light' ? 'light' : 'dark';
}

export function applyTheme(mode = readThemeMode()) {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-mode', mode);
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#efe6d6' : '#0e1318');
  document.dispatchEvent(new CustomEvent('senders-theme-change', { detail: { mode, theme } }));
  return { mode, theme };
}

export function setThemeMode(mode) {
  const next = MODES.includes(mode) ? mode : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

function cycleThemeMode() {
  const current = readThemeMode();
  const index = Math.max(0, MODES.indexOf(current));
  return setThemeMode(MODES[(index + 1) % MODES.length]);
}

function syncThemeButton(wrap, mode) {
  const btn = wrap.querySelector('.nav-theme-btn');
  if (!btn) return;
  btn.innerHTML = ICONS[mode] || ICONS.dark;
  const labels = themeLabels();
  const label = labels[mode] || labels.dark;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
}

export function initThemeControl() {
  applyTheme(readThemeMode());

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    if (readThemeMode() === 'auto') applyTheme('auto');
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSystem);
  else mq.addListener(onSystem);

  const nav = document.getElementById('nav');
  if (!nav) return;

  let wrap = document.getElementById('navThemeWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'navThemeWrap';
    wrap.className = 'nav-theme-wrap';
    wrap.innerHTML = `
      <button type="button" class="nav-theme-btn" id="navThemeBtn" aria-label="${t('theme.dark')}" title="${t('theme.dark')}">${ICON_MOON}</button>
    `;
    const avatar = document.getElementById('navAvatarWrap');
    if (avatar) avatar.after(wrap);
    else nav.appendChild(wrap);
  } else {
    wrap.querySelector('.nav-theme-menu')?.remove();
    wrap.classList.remove('open');
  }

  const btn = wrap.querySelector('.nav-theme-btn');
  if (!btn) return;
  btn.removeAttribute('aria-haspopup');
  btn.removeAttribute('aria-expanded');
  syncThemeButton(wrap, readThemeMode());

  if (btn.dataset.themeCycleBound === '1') return;
  btn.dataset.themeCycleBound = '1';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = cycleThemeMode();
    syncThemeButton(wrap, mode);
  });

  document.addEventListener('senders-theme-change', () => {
    syncThemeButton(wrap, readThemeMode());
  });
}
