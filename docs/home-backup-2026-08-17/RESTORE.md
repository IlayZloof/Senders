# Restore home look (pre mobile-v2, 2026-08-17)

This folder is a snapshot of the home **nav + hero** before:

- forcing SENDERS logo **left** and hamburger **right**
- changing phone slideshow from `cover` crop to `contain` + blurred fill

HTML markup did not need to change. Revert is CSS (and optional SW cache name).

## Fast revert (recommended)

1. In `styles.css`, search for `MOBILE-V2-2026-08-17`.
2. Remove those added override blocks.
3. Uncomment the previous mobile hero rule that is marked `PREVIOUS (cropped jumper on phone)`.
4. Remove `direction: ltr` on `.nav` and the `direction: rtl` on `.nav-panel` / `.nav-links` / `.nav-auth` if you added them in that same change.
5. Optional: set `public/sw.js` `CACHE_NAME` back to `senders-v2` (or bump to a new name after revert so phones drop the v2 CSS cache).
6. Run `npm run build && npm run deploy`.
7. On the phone: **close the PWA fully and reopen** (or clear site data) so the service worker picks up the CSS.

## Full paste revert

Copy rules from `styles-hero-nav.css` back over the matching sections in `styles.css`.

`index-hero-nav.html` is the nav + hero snippet from `index.html` at backup time. Brand text is `SENDERS` / `Senders` — do not change it.

## What the old mobile hero did

At `max-width: 640px`, vertical slides used:

```css
.hero-bg-slide--vertical .hero-bg-sharp {
  background-size: cover;
  background-position: center 30%;
}
```

Landscape slides already used `cover` + `center 35%` on all breakpoints. That cropped the jumper on phones.
