/** Shared site footer — logo + short tagline only (no tab/sitemap links) */
export function initFooter() {
  const el = document.getElementById('siteFooter');
  if (!el) return;

  el.innerHTML = `
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="nav-logo">SEND<span>ERS</span></span>
        <p>קהילת קופצי צוקים בישראל</p>
        <p class="footer-caption">מוצאים מקומות חדשים, קובעים מפגשים ומשתפים חוויות וקפיצות מהשטח.</p>
      </div>
    </div>
  `;
}
