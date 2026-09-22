# Restore 3-slide home hero (2026-08-19)

Snapshot of home hero HTML + CSS **before** switching to a single fixed image
(`hero-cliff-landscape.png`). Hebrew copy was not changed.

## Fast revert

1. Paste `index-hero-slideshow.html` over the matching `<section class="hero …">` block in `index.html`.
2. Paste `styles-hero-slideshow.css` over the matching hero-bg slideshow block in `styles.css`.
3. Optional: bump `public/sw.js` `CACHE_NAME` after revert.
4. Run `npm run build && npm run deploy`.
5. On the phone: close the PWA fully and reopen so the service worker picks up the change.
