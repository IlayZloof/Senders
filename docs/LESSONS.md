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
