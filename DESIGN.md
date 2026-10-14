# Senders — Cinematic Cliff Editorial

**Design read:** Night cliff-dive magazine — dramatic, editorial, immersive photography-first.

| Dial | Value |
| --- | --- |
| DESIGN_VARIANCE | high |
| MOTION_INTENSITY | medium-high |
| VISUAL_DENSITY | airy |

## Tokens
- **Radius:** soft / pill (`22px` cards, `999px` buttons)
- **Color:** ink black `#05070a`, wet-rock slate, electric aqua `#2ee6d6`, cool indigo secondary
- **Type:** Frank Ruhl Libre (display, Hebrew serif) + Heebo (body)
- **Motion:** brand rise, staggered tiles 80–290ms, ease-out curves; `prefers-reduced-motion` respected

## Layout families
1. Full-bleed reel freeze-frame hero
2. Editorial caption bar (kicker + CTAs)
3. Asymmetric magazine tile grid (featured map tile spans 2 rows)
4. Soft-pill nav chips
5. Glowing aqua map / auth surfaces

## References
- Editorial outdoor magazines / night surf films
- Instagram @ilay_zloof reel energy (freeze-frame hero)
- Anti-slop: no purple gradients, no Inter-only, no identical three-card grids

## Key files
- `theme-cinematic.css` — full token + layout overhaul
- `index.html` — cinematic editorial bar
- All public HTML wired to theme + fonts
