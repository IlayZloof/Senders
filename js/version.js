/* global __APP_VERSION__ */
/**
 * Site version — single source of truth is "version" in package.json,
 * injected at build time by Vite (`define: { __APP_VERSION__ }` in vite.config.js).
 * The same value is published at /version.json.
 */
export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function versionLabel() {
  return `גרסה ${APP_VERSION}`;
}

/** Markup used inside the shared site footer (see footer.js). */
export function versionLineHtml() {
  return `<p class="app-version" data-app-version="${APP_VERSION}" dir="rtl">${versionLabel()}</p>`;
}

/**
 * Pages without the shared #siteFooter (login, profile, settings, admin…)
 * get a small standalone version line at the bottom of the page.
 */
function mountStandaloneVersion() {
  if (document.getElementById('siteFooter')) return; // footer.js renders it
  if (document.querySelector('[data-app-version]')) return;
  const el = document.createElement('div');
  el.className = 'app-version app-version--standalone';
  el.dir = 'rtl';
  el.dataset.appVersion = APP_VERSION;
  el.textContent = versionLabel();
  document.body.appendChild(el);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStandaloneVersion);
  } else {
    mountStandaloneVersion();
  }
}
