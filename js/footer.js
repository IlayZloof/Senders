import { t } from './i18n.js';

/** Shared site footer — logo + short tagline only (no tab/sitemap links) */
export function initFooter() {
  const el = document.getElementById('siteFooter');
  if (!el) return;

  el.innerHTML = `
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="nav-logo">SEND<span>ERS</span></span>
        <p>${t('footer.tagline')}</p>
        <p class="footer-caption">${t('footer.caption')}</p>
      </div>
    </div>
  `;
}
