---
version: alpha
name: Coral — Frame (video / frame layer)
description: >
  Video-first companion to Coral's design.md. The unit is the frame (1920×1080), not the
  slide-in-a-deck. Atoms are identical and sacred — the three-surface system (coral fire /
  ink black / warm cream), Big Shoulders display (sentence case) + Atkinson Hyperlegible Next body, the 45° diagonal hatch,
  decorative wallpaper numerals, hard color-region splits, zero shadow, zero radius (save
  circles). Composition, frame scale, and aspect-ratio behavior are rewritten for the frame.
  Motion is out of scope.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  # Rendezvous brand mapped by hand (the auto-map picked the iMessage-bubble blue as accent).
  # "coral" keeps its role name but carries the brand's signal red: the table everyone meets at.
  coral: "#E3262E"
  coral-dark: "#B81C23"
  cream: "#EEF1F4"
  cream-dark: "#E2E7ED"
  black: "#0E1B2C"
  gray: "#4A5868"
  light-gray: "#C9D1DA"
  white: "#FFFFFF"
  # One line per friend, the transit-diagram identity. Use only for routes, dots and their labels.
  line-jason: "#2551E0"
  line-maya: "#F57A12"
  line-dev: "#8E3FD0"
  line-ana: "#0D9A64"

typography:
  # — reading ramp (Atkinson Hyperlegible Next) —
  body:          { fontFamily: "Atkinson Hyperlegible Next", cqw: 1.0,  weight: 400, lineHeight: 1.7 }
  body-light:    { fontFamily: "Atkinson Hyperlegible Next", cqw: 1.5,  weight: 400, lineHeight: 1.5, note: "pull-quote voice" }
  section-label: { fontFamily: "Atkinson Hyperlegible Next", px: 12, weight: 700, tracking: "4px" }
  item-label:    { fontFamily: "Atkinson Hyperlegible Next", px: 11, weight: 700, tracking: "3px" }
  quote-attribution: { fontFamily: "Atkinson Hyperlegible Next", px: 14, weight: 600, tracking: "3px" }
  quote-role:    { fontFamily: "Atkinson Hyperlegible Next", px: 12, weight: 400, tracking: "1px" }
  # — display / hero ramp (Big Shoulders 900, sentence case, untracked) —
  card-title:    { fontFamily: "Big Shoulders", cqw: 1.9, weight: 900, lineHeight: 1.1, tracking: "0px" }
  sidebar-value: { fontFamily: "Big Shoulders", cqw: 2.3, weight: 900, lineHeight: 1.0 }
  bar-title:     { fontFamily: "Big Shoulders", cqw: 2.3, weight: 900, lineHeight: 1.0, tracking: "0px" }
  card-stat:     { fontFamily: "Big Shoulders", cqw: 2.5, weight: 900, lineHeight: 1.0 }
  column-title:  { fontFamily: "Big Shoulders", cqw: 3.7, weight: 900, lineHeight: 1.0, tracking: "0px" }
  section-headline:{ fontFamily: "Big Shoulders", cqw: 4.2, weight: 900, lineHeight: 1.0, tracking: "0px" }
  stat-numeral:  { fontFamily: "Big Shoulders", cqw: 5.0, weight: 900, lineHeight: 1.0 }
  hero-title:    { fontFamily: "Big Shoulders", cqw: 6.5, weight: 900, lineHeight: 0.9, tracking: "0px" }
  jumbo-feature: { fontFamily: "Big Shoulders", cqw: 9.0, weight: 900, lineHeight: 1.0, tracking: "0px" }
  # — decorative —
  background-numeral: { fontFamily: "Big Shoulders", cqw: 10.0, weight: 900, color: "rgba(0,0,0,0.12)", note: "wallpaper numeral inside a coral region" }
  giant-mark:    { fontFamily: "Big Shoulders", cqw: 14.0, weight: 900, color: "rgba(0,0,0,0.35)", note: "decorative quote mark inside a coral region" }

spacing:
  pad-x: "5cqw"       # standard horizontal frame padding
  pad-y: "4cqw"
  pad-col: "3cqw"
  gap-grid: "1.7cqw"
  card-pad: "2cqw"

components:
  diagonal-hatch:
    backgroundImage: "repeating-linear-gradient(45deg, transparent 0 20px, rgba(0,0,0,.06) 20px 40px)"
    placement: "::before overlay on {colors.coral} regions"
    description: "Signature 45° hatch (6% ink). Variants −45° 30/60px, 90° vertical 60/62px 10% ink. Texture, never depth."
  region-split:
    layout: "two/three solid surfaces meeting at a hard edge; ratios 38/62 rows, 40/60 cols, 50/50"
    rounded: "0"
    description: "The primary layout device — no gradient, no rounded junction; the boundary is the layout."
  card:
    backgroundColor: "{colors.white}"
    borderTop: "0.26cqw solid {colors.coral}"
    rounded: "0"
    shadow: "none"
    typography: "{typography.card-title} + {typography.body}"
    description: "5px coral TOP border is the only chrome; holds a card-icon, title, body, coral card-stat."
  sidebar-item:
    backgroundColor: "{colors.white}"
    borderLeft: "0.2cqw solid {colors.coral}"
    rounded: "0"
    typography: "{typography.sidebar-value} + {typography.section-label}"
    description: "4px coral LEFT border is the only chrome."
  card-icon:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.white}"
    size: "2.5cqw square"
    rounded: "0"
    description: "The card mark — one white Bebas glyph centered."
  accent-line:
    backgroundColor: "{colors.coral}"
    size: "4cqw × 0.25cqw (60×4 closing variant)"
    rounded: "0"
    description: "Sub-headline accent rule."
  background-numeral:
    typography: "{typography.background-numeral}"
    color: "rgba(0,0,0,0.12)"
    placement: "behind a {colors.coral} region's title"
    description: "The wallpaper-numeral signature (12% ink)."
  giant-mark:
    typography: "{typography.giant-mark}"
    color: "rgba(0,0,0,0.35)"
    placement: "inside a {colors.coral} region"
    description: "Oversized quote mark / character, half-decorative."
  timeline:
    line: "0.2cqw solid {colors.black} (gradient-dashed ::after)"
    node: "{colors.coral} circle, {colors.cream} halo, 50% radius"
    description: "Ink line with coral nodes + cream halos."
  info-bar:
    backgroundColor: "{colors.cream-dark}"
    typography: "{typography.bar-title} + uppercase {typography.section-label}"
    rounded: "0"
    shadow: "none"
    description: "Footer band beneath a feature region — Bebas title left, Atkinson Hyperlegible Next meta right."
---

# Coral — Frame (video / frame layer)

## Brand adaptation (READ FIRST — the frontmatter is the source of truth)

This is the **coral** preset remixed onto the captured brand. The YAML frontmatter above (colors · typography · components) is **normative and already correct — use it verbatim.** The prose below is the ORIGINAL preset's intent; read it THROUGH the frontmatter:

- **Fonts** — already set to **Big Shoulders** (display) / **Atkinson Hyperlegible Next** (body); ignore any preset font name lingering in prose.
- **Weights** — the brand font ships `{400, 600, 700, 800, 850, 900}` only; every weight is clamped to these — ignore higher preset weights (e.g. 600/700) in prose.
- **Colors** — use the frontmatter hex; preset color NAMES in prose (e.g. "cobalt", "cream") mean the remapped brand values.


## Rendezvous overrides (these win over every line of prose below)

- **Display face is Big Shoulders 900, sentence case, untracked.** Wherever the prose says "Bebas", read Big Shoulders. No forced uppercase and no letter-spacing on display or labels.
- **The signature is the transit line, not the hatch.** Drop the 45° diagonal hatch. The brand's own device: thick colored lines (one per friend: `line-jason`, `line-maya`, `line-dev`, `line-ana`) with round caps, straight runs, 45° bends and rounded corners, meeting at one station: a platform-colored circle with a thick ink ring and a `coral` (signal red) dot.
- **`coral` is signal red and it is scarce.** Use it only for the destination dot, the arrival moment (a clock turning red at 7:15), and the final call to action.
- **Ground is `cream` (#EEF1F4 enamel grey); ink is `black` (#0E1B2C navy).** Circles are allowed for stations and origin dots. No shadows except the phone.
- **The phone is the one realistic object:** a light iPhone with iMessage bubbles (#0A84FF outgoing, #E9E9EE incoming, system font).
- **Font files (variable, Latin):** Big Shoulders → `assets/fonts/BigShoulders-latin.woff2` (weight 400–900); Atkinson Hyperlegible Next → `assets/fonts/AtkinsonHyperlegibleNext-latin.woff2` (weight 300–800). Declare each with `@font-face` + a `font-weight` range and point `src` at these files.
- **The hero line of copy is "Four routes, one table."** with the full stop drawn as the red station dot.

## Overview

Coral at frame scale is a **bold magazine poster** built from three solid surfaces — coral fire,
ink black, warm cream — that meet at **hard color edges.** The region boundary IS the layout: a
frame splits into a coral plane + a cream plane, or a coral panel + an ink panel, each holding a
self-contained composition. No gradient transitions, no rounded junctions, no drop shadows.

The voice is a two-face hierarchy: **Atkinson Hyperlegible Next** — tall condensed caps, always uppercase, always
tracked (1–12px) — carries every headline, stat, title, and meta figure; **Atkinson Hyperlegible Next** carries every
body line, label, and attribution across weights 300–700. Bebas declares; Atkinson Hyperlegible Next explains. The
signature atmospherics are the **45° diagonal hatch** (6% ink) over coral regions and the
**oversized wallpaper numeral** (12% ink) behind a region's title.

**Key characteristics at frame scale:**

- **Three surfaces, hard edges** — `{colors.coral}` / `{colors.black}` / `{colors.cream}` as solid regions.
- **Bebas uppercase + tracking** on every display element; **Atkinson Hyperlegible Next** on every body/label.
- **45° hatch** (6% ink) on coral regions; **wallpaper numerals** (12%) and **giant marks** (35%) behind content.
- **Ink-on-fire** — Bebas on coral is always ink, never white. Eyebrows coral on cream/ink, ink on coral.
- **Flat** — no shadow, no elevation; radius only on circles (nav dots, timeline nodes).
- **Coral as accent AND environment** — 4–5px coral borders, 48px coral icon squares, and full coral regions.

### Frame Craft Bar

Three eyeball tests gate every frame before any structural check:

- **Squint** — one element dominates at **3–6× its nearest neighbor**: the `hero-title`/`jumbo-feature` or a wallpaper numeral behind a region's title, never two rival headlines.
- **Silence** — coral/cream/ink regions read **40–55% empty**; the **three-column catalog is the one dense exception**. A coral region underfilled gets a wallpaper numeral, never more content.
- **Restraint** — coral fires as **either accent or one full region per frame** (not both at full strength); one giant-mark per quote; ink-on-fire (never white on coral).
- **Reference** — aim at a **sports-magazine cover / Saul Bass travel poster** (solid planes at hard edges, condensed caps as architecture); failure looks like a **soft drop-shadowed card deck**.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16). **Square:** 1080×1080 (1:1).
- **Safe area:** `5cqw` (pad-x) standard frame padding; region edges may bleed full-frame.

**The container law (load-bearing).** Every frame ground sets `container-type: size`; ALL
frame-relative units are `cqw`/`cqh` resolved against it — **never `vw`.** A `vw`-sized frame
inflates whenever it isn't full-screen; `cqw` resolves against the frame at any render size.

## Colors

Tokens identical to the source. At frame scale the three surfaces are intermixed by composition —
coral/cream, coral/ink, ink/cream, or single-surface. `{colors.coral}` is both accent (borders,
icon squares, timeline nodes, eyebrows on cream/ink) and environment (full regions). Headlines:
ink on cream/coral, cream on ink — **never gray, never white-on-coral.** Eyebrows: coral on
cream/ink, ink on coral — coral-on-coral does not exist. The only sanctioned gradient is the rare
135° coral-dark→coral feature region; everything else is flat.

## Typography

Two ramps. The **reading ramp** (Atkinson Hyperlegible Next body 1.0cqw, body-light 1.5cqw, labels in px) carries copy
and eyebrows; the **display/hero ramp** (Bebas, `card-title` 1.9cqw → `jumbo-feature` 9.0cqw, plus
the decorative `background-numeral` 10cqw and `giant-mark` 14cqw) carries every headline and stat.

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**; px labels are chrome only.
- **Fit-to-measure:** size the headline to its line length. Cap the block at **≤ 78cqw**; ≤3 words → `hero-title`/`jumbo-feature`; 4–6 → `section-headline`; 7+ → `column-title`.
- **Every Bebas element is uppercase with ≥1px tracking** (2px standard, 4px hero, 12px jumbo). **Every Atkinson Hyperlegible Next label is uppercase, 1–4px tracked.** No italic, no underline, no sentence-case Bebas.

## Depth & Surface

Flat, with hard color edges. Depth signals only:

- **Hard region boundaries** — the primary structural device.
- **Accent borders** — 5px coral top (cards), 4px coral left (sidebar tiles), 4px ink (timeline).
- **45° hatch** — 6% ink texture on coral regions (no depth).
- **Wallpaper typography** — numerals at 12%, giant marks at 35%, layered behind content.

**Ceiling:** no box-shadow, no elevated card, no soft gradient (save the one 135° coral feature), no rounded rectangle.

## Shapes

- **0 radius** on every rectangle — regions, cards, sidebar tiles, icon squares, info bars, accent lines.
- **50%** on circles only — nav dots (10px), nav arrows (44px), timeline nodes (20px).

## Components

- **region-split** — the layout device; surfaces meet at a hard edge.
- **card** (5px coral top) / **sidebar-item** (4px coral left) / **card-icon** (48px coral square) — the only chrome on each is its single coral border.
- **diagonal-hatch** / **background-numeral** / **giant-mark** — the atmospheric + wallpaper signatures on coral regions.
- **accent-line** — coral sub-headline rule. **timeline** — ink line, coral nodes, cream halos. **info-bar** — cream-dark footer band.

## Frame Treatments

> Recipe per plate: ground · container · composes · focal · chrome · accent · silence · Fixed/Free · density.
> Lean centered where the move allows; vary anchor; one idea per region.

### 1 · Region-Split Cover (identity · move: hard region edge · left)

**Ground** 38/62 split — `{colors.coral}` top band (hatch + wallpaper numeral) over `{colors.cream}`.
**Container** grid rows; brand + meta in the coral band, hero title in the cream field. **Composes**
region-split, diagonal-hatch, background-numeral, hero-title. **Focal** a 2-line `hero-title` in
ink, second line in `{colors.coral}`, left-anchored in the cream field. **Chrome** Bebas brand left

- Bebas meta right in the coral band. **Accent** coral band + coral second line. **Silence** the
  cream field ~45% empty. **Fixed** ink-on-fire in band, hatch on coral, hard edge. **Free** title
  copy, which line is coral, meta. **Density** sparse.

### 2 · Feature Stat (anchor · move: scale · coral environment · left)

**Ground** full `{colors.coral}` with hatch. **Composes** diagonal-hatch, background-numeral,
section-label, stat headline, body-light. **Focal** a `stat-numeral`/`jumbo-feature` figure or
2-line headline in ink, with a `background-numeral` (12% ink) behind it as wallpaper. **Chrome** an
ink `section-label` eyebrow; an optional Atkinson Hyperlegible Next-300 support line ≤44cqw. **Accent** the coral ground
IS the environment; ink type, no white. **Silence** ~40% of the coral field empty. **Fixed**
ink-on-coral, hatch present, wallpaper numeral behind. **Free** the figure, headline, support copy.
**Density** sparse.

### 3 · Quote Layout (quote · move: panel split · giant mark)

**Ground** 40/60 split — `{colors.coral}` left panel (hatch + giant-mark) + `{colors.black}` right
panel. **Composes** region-split, giant-mark, body-light, accent-line, quote-attribution.
**Focal** a 2–3 line pull quote in `{colors.cream}` Atkinson Hyperlegible Next **weight 300** on the ink panel.
**Chrome** a `giant-mark` (35% ink) on the coral panel; a `60×4` coral accent-line above the
attribution. **Accent** coral panel + coral accent-line. **Silence** the coral panel is mostly the
mark. **Fixed** Atkinson Hyperlegible Next-300 quote, ink panel, ink-on-coral mark. **Free** quote, attribution, mark
glyph. **Density** sparse.

### 4 · Closing Plate (closer · move: cream field + coral band · centered)

**Ground** `{colors.cream}` field with a bottom `{colors.coral}` band (hatch). **Composes**
section-label, section-headline/hero-title, accent-line, info-bar. **Focal** a 2-line sign-off in
ink, centered, with a coral `accent-line` beneath. **Chrome** an ink eyebrow above; a coral band
footer carrying a Bebas sign-off + year. **Accent** coral band + coral accent-line. **Silence**
~55% empty cream. **Fixed** centered, ink type, one coral band. **Free** sign-off copy, band
contents. **Density** sparse.

### 5 · Three-Column Catalog (catalog · move: density — the dense frame · centered head)

**Ground** `{colors.cream}` (or `{colors.black}`), `pad-x`. **Composes** section-headline, 3× card.
**Focal** a centered `section-headline` over three white `card`s (5px coral top, 48px icon square,
Bebas title, Atkinson Hyperlegible Next body, coral stat). **Accent** the three coral top borders + icon squares.
**Silence** tight — the density exception. **Fixed** 5px coral top as sole chrome, no shadow/radius.
**Free** the three cards' content. **Density** dense-exception.

### 6 · Timeline (process · move: horizontal rail · left)

**Ground** `{colors.cream}`, `pad-x`. **Composes** section-headline, timeline. **Focal** the ink
timeline-line with 4–5 coral nodes (cream halos) and Bebas labels. **Accent** coral nodes.
**Silence** moderate. **Fixed** ink line, coral nodes, cream halos. **Free** node count, labels.
**Density** standard.

## Composition Rules

### Do

- Compose as **multi-surface region splits** — coral / ink / cream meeting at hard edges; the boundary is the layout.
- Set every Bebas element **uppercase + tracked** (2px standard, 4px hero, 12px jumbo); every Atkinson Hyperlegible Next label uppercase, 1–4px.
- Render eyebrows **coral on cream/ink, ink on coral**; headlines ink on cream/coral, cream on ink.
- Apply the **45° hatch** (6% ink) on coral regions; fill underweight coral regions with a **12% wallpaper numeral**.
- Use the **5px coral top** (cards) / **4px coral left** (tiles) as the only chrome on those elements.
- Lean centered on cover sign-offs and catalog heads; left/panel-split on features and quotes.

### Don't

- Don't render Bebas in sentence case or untracked; don't pair it with a non-Atkinson Hyperlegible Next body sans.
- Don't add a fourth surface, a drop shadow, an elevation, or a rounded rectangle.
- Don't put white headlines on coral (always ink) or gray headlines anywhere (gray is body/meta).
- Don't soften a region boundary with a gradient (except the rare 135° coral feature).
- Don't fill a coral region with sparse fragments — fully populate it or add a wallpaper numeral / giant mark.
- Don't blow a headline edge-to-edge — step the ramp down for long lines.

## Aspect-Ratio Behavior

| Treatment            | 16:9                       | 9:16                                 | 1:1                  |
| -------------------- | -------------------------- | ------------------------------------ | -------------------- |
| Region-Split Cover   | 38/62 rows, title left     | taller coral band, title below       | 40/60, title lower   |
| Feature Stat         | figure left, numeral right | figure top, numeral behind           | centered figure      |
| Quote Layout         | 40/60 coral+ink            | stacked: coral mark top, quote below | stacked              |
| Closing Plate        | cream + bottom coral band  | cream + taller band                  | centered, band below |
| Three-Column Catalog | head over 3-up             | head top, 3 stacked                  | head top, 2+1        |
| Timeline             | horizontal rail            | vertical rail                        | compact horizontal   |

Safe area holds the `5cqw` padding on the short edge; re-step display per ratio so no load-bearing
line drops below the 1.4cqw floor. Bebas runs ~20% wider in CJK — adjust line breaks per ratio.

## Approved Entities

No real customers, logos, or vendors are defined in the source — render any such mark as a
placeholder. The system supplies surfaces and geometry, not brands.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts at frame scale. Render slots as `— figure —`,
`{metric}`, `N×`. Real numerals appear only when the script supplies them — the feature stat,
catalog, and timeline especially carry placeholders, not fabricated values. Wallpaper numerals
(01, 02…) are decorative and may be ordinal.

## Pre-Render Self-Audit

- **Squint** — one focal element per region dominates at 3–5× its neighbor.
- **Silence** — sparse frames 40–55% empty; only the catalog runs dense.
- **Surfaces** — two or three of coral/ink/cream, meeting at hard edges; no fourth surface.
- **Type** — Bebas uppercase + tracked, fit-to-measure; ink-on-coral; eyebrow color correct for surface; ≥1.4cqw floor.
- **Depth** — 0 shadow, 0 rounded rectangle; hatch + wallpaper carry texture.
- **Anchor** — centered on sign-offs/heads, panel/left on features/quotes; no 3 consecutive frames share an anchor.
- **Fabrication** — every numeral traces to the script, else placeholder.

## Known Gaps

- **Motion intentionally out of scope.** frame.md specifies composition only; timing and transitions are a later stage. The 0.6s opacity fade in the source is a deck mechanic, not a frame spec.
- **Atkinson Hyperlegible Next + Atkinson Hyperlegible Next via Google Fonts.** CJK pairing (ZCOOL XiaoWei / Yozai) carries over from the source's CJK section; Bebas runs ~20% wider in CJK.
- **9:16 / 1:1 are guidance**, not pixel-locked; verify the legibility floor per ratio.
- The 45° hatch, wallpaper numerals, giant marks, and timeline dash are CSS-only; no external imagery is required.
