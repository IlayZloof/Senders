# Senders — Raw Summit Brutal

**Design read:** Outdoor-action newspaper — sharp, loud, athletic, zero fluff.

| Dial | Value |
| --- | --- |
| DESIGN_VARIANCE | high |
| MOTION_INTENSITY | low-medium |
| VISUAL_DENSITY | denser |

## Tokens
- **Radius:** all-sharp (`0`)
- **Color:** black `#0a0a0a` / off-white `#f5f5f0` / safety orange `#ff4d00` / neon lime `#c8ff00`
- **Type:** Heebo 900 (display) + Rubik (body); uppercase masthead energy
- **Borders:** 3px hard; offset box-shadow stamps (`4px 4px 0`)
- **Motion:** short press feedback only; reveal 280ms

## Layout families
1. Newspaper masthead hero with rotated stamp badges
2. Dense 2×2 poster tile grid (shared borders, no gaps)
3. Hard-bar nav with filled active chips
4. Stamp difficulty / height badges
5. Brutal map frame (square corners, thick border)

## References
- Sports newspaper / race posters / skate zines
- Anti-slop: no glassmorphism, no soft AI cards

## Key files
- `theme-raw.css`
- `index.html` — raw masthead + stamps
