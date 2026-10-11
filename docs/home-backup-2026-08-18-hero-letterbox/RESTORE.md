# Restore hero letterbox CSS (2026-08-18)

Snapshot of home hero CSS **before** the letterbox fix: no gray/solid bars,
stronger blurred backdrop, shorter mobile hero.

Hebrew copy in `index.html` was not changed.

## Fast revert

1. Paste `styles-hero-letterbox.css` back over the matching sections in `styles.css`.
2. Optional: set `public/sw.js` `CACHE_NAME` back to `senders-v3` (or bump to a new name after revert).
3. Run `npm run build && npm run deploy`.
4. On the phone: close the PWA fully and reopen so the service worker picks up the CSS.
