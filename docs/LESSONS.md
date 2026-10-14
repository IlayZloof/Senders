# Lessons: bug classes and the guards that stop them coming back

Rule: fix the root cause generically, never per user. Every guard below is in
`js/data-guards.js` (pure, no DOM) or `js/video-fallback.js`, and is covered by
`tests/data-guards.test.js`. `npm run build` runs `npm test` first (`prebuild`),
so both deploy workflows (main and dev) fail before deploying if a guard breaks.

## 1. Content vanished when its reference wasn't in a loaded list
- **Bug (Oct 13, v1.0.11):** איתי's reels uploaded fine but never appeared.
- **Root cause:** feeds kept items only if their `spot_id` was in the loaded spot
  list (allow-list). Free-text tags (`custom:<name>`), spot aliases, deleted or
  not-yet-loaded spots were silently dropped. The same pattern was in reels,
  meetups, community updates and the spot page (alias ids).
- **Guard:** `hiddenSpotIdSet()` + `filterBySpotVisibility()` — a deny-list.
  Only spots that exist and are hidden from this viewer (admin-only) hide
  content; any unknown reference is shown, with `liveSpotName()` as the label.

## 2. Stored copies shown instead of live data
- **Bug:** Lev renamed himself; his reel kept showing "levperi654".
- **Root cause:** `display_name` / `spot_name` are copied onto rows at write
  time, and the UI used the copy unless it was empty.
- **Guard:** `liveDisplayName()`, `liveSpotName()`, `applyLiveNames()` with
  `fetchProfilesById()` in the store: live profile/spot first, stored copy as
  fallback. Applied to reels, spot posts, meetups and community updates.

## 3. Media that relied only on muted autoplay
- **Bug:** videos opened from the map (spot page carousel) didn't play.
- **Root cause:** `<video muted autoplay>` with no controls; swipe pointer
  capture swallowed taps; WebM (MediaRecorder output) may not decode on iOS.
- **Guard:** `guardVideo()` on every reel/spot video: tap-to-play overlay when
  `play()` is refused, a clear Hebrew notice when the format can't be decoded
  (`cannotPlayVideoUrl()`); spot carousel tap-to-play + "צפייה ברילס" link;
  the clip editor now records MP4 first (`RECORDER_MIME_PREFERENCE`).

## 4. Upload failures without a reason
- **Root cause:** raw storage error text (English JSON) or a generic message;
  RLS refusals for accounts waiting for approval said "צריך להתחבר".
- **Guard:** `validateVideoFile()` runs before any byte is sent (type incl.
  iPhone MOV/HEVC by extension, empty file, >40MB with the actual size);
  `uploadErrorMessage()` maps 413 / MIME / network / JWT / RLS / 5xx to clear
  Hebrew reasons.

## Adding a new feed or list
Use `filterBySpotVisibility(items, await getHiddenSpotIds())`, never
`visibleIds.has(...)`; render names through `liveDisplayName`; pass every new
`<video>` through `guardVideo`. Add a test case to `tests/data-guards.test.js`.

## 5. Reel recorded as WebM with an alpha channel did not play on iPhone
- **Bug (Oct 13):** ישי: "videos don't work via the map". Verified with
  Playwright WebKit (iPhone 13): Lev's reel on מפל דבורה fails with
  `MEDIA_ERR_SRC_NOT_SUPPORTED`; every other reel plays. Chromium plays all.
- **Root cause:** the file's track header has Matroska `AlphaMode=1` (Chrome
  MediaRecorder output from an alpha canvas). WebKit refuses alpha VP9. The
  same stream with the flag flipped to 0 plays (verified). Not resolution, not
  codec, not the network.
- **Guards:** clip-editor canvas uses `{ alpha: false }` and caps output at
  1080p (`fitWithin`); every WebM upload passes through `clearWebmAlphaFlag()`
  before upload; the player shows "can't play this format" for error code 4
  instead of "check your connection" (`videoErrorKind`).

## 6. Stale JavaScript after a deploy
- **Risk:** a tab or home-screen app left open keeps running old code; the
  service worker already uses skipWaiting/clients.claim and network-first HTML
  with hashed assets, so a fresh load is always current, but an open tab is not.
- **Guard:** `startStaleVersionGuard()` (js/ui.js) checks /version.json on
  load, on return to the tab and every 10 min, and reloads once per new version
  (`shouldReloadForVersion`, never during an upload).

## 7. Spot carousel showed "format/resolution" for videos that were never deployed
- **Bug (Oct 14):** מישה on iPhone 16 Safari (preview): spot **קצא – אילת**
  (`eilat-katza`) showed «המכשיר הזה לא מצליח לנגן את הסרטון הזה (פורמט או
  רזולוציה)» on a carousel video slide. UI and 4G were fine — not a Cloudflare
  block.
- **Root cause:** seed spots list `/videos/spots/*.mov|mp4`, but `public/videos/`
  is gitignored and never reaches the Worker, so every seed clip 404s. Safari
  reports `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) for a missing resource, and we
  labeled code 4 as a codec/format problem. Separate class: older user WebMs still
  have Matroska `AlphaMode=1` (upload sanitize only helps new files).
- **Guards:** `isUnshippedLocalVideo()` + filter in `getSpotMedia()` so broken
  seed clips never become `<video>` slides; `videoErrorKind` treats unshipped
  `/videos/` as a load error, not unsupported; on WebM decode failure
  `repairWebmObjectUrl()` fetches the file, `repairedWebmBytes()` / 
  `clearWebmAlphaFlag()`, and replays from a blob (covers pre-sanitize uploads).

## 8. Login vs signup must feel like different modes
Testers reported login and signup looking the same. Share one page but change title, lead, Google CTA, submit label, name field, forgot-link visibility, and `?mode=signup` in the URL when switching tabs.

## 9. Add-spot map + extracted coords
- `input type=number step=0.001` rejects Google-extracted coords (e.g. 33.17509) — Chrome shows Hebrew «הערך שחולץ לא תקין». Use `step=any`.
- Leaflet must not be created while the wizard panel is `display:none`; otherwise the view looks stuck north (Lebanon/Cyprus). Init/refresh on step 3 with `invalidateSize` + Israel center.

## 10. Map page desktop: viewport height vs sidebar list
- **Bug:** On desktop the map column was ~full `100dvh` while a hero sat above it, so the page scrolled a long way; the left spot name list grew with every spot and stretched the grid (`min-height: auto` + `overflow: visible`).
- **Fix:** Cap `.map-page .map-layout` to `100dvh - nav - hero` (~7rem), set sidebar/list `min-height: 0` + `overflow-y: auto` on `.map-spot-list` so names scroll inside the column. Mobile (`max-width: 900px`) keeps height:auto / overflow visible. Remeasure Leaflet (`invalidateSize` + Israel bounds) after layout.
