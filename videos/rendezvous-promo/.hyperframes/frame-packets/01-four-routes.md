# Frame packet: 01-four-routes

## Project inputs

- Project: /Users/jasonpitchford/Dev/rondezvous/videos/rendezvous-promo
- Design tokens: /Users/jasonpitchford/Dev/rondezvous/videos/rendezvous-promo/frame.md
- RULES_DIR: /Users/jasonpitchford/.claude/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 1 — Four routes, one table

- scene: Four colored transit lines draw in from four corners at four different times and meet at one red station as a clock runs to 7:15
- voiceover: "Four friends. Four routes. One table — at seven fifteen."
- duration: 3.989s
- transition_in: cut
- status: outline
- src: compositions/frames/01-four-routes.html
- type: hook
- persuasion: Future pacing
- beat: curiosity → satisfaction
- asset_candidates: assets/svg-7d08e119.svg — the site's hero diagram: four friends' lines from North Campus, Olin Library, Duffield Hall and the Commons meeting at Sangam

- blueprint: spatial-pan-stations (Adapt)
- focal: assets/svg-7d08e119.svg
- roles: svg-7d08e119 = supporting (reference for the exact route geometry, colors and station; rebuild it as live SVG so each line can self-draw)
- sfx: soft-whoosh, chime

Adapt: keep the signature — stations pre-placed on one canvas and traversed station by station, landing held on the final station — but the "pan" is the four routes themselves drawing station to station into the shared table, with a gentle camera settle onto the table at the end.
Scene 1 (0.0–1.2s): "Four friends." Full-frame diagram canvas, centered; four origin stations (rings in each friend's color) pop in one per corner with name labels (Jason, Maya, Dev, Ana) — origins only, no lines yet. A large clock "6:46" sits upper-left in display role.
Scene 2 (1.2–2.6s): "Four routes." The four lines self-draw from their origins along their 45° bends at different start times (Jason first, Dev last), each with a small walker dot riding its leading tip; the clock ticks forward with them. Layered depth: ghost dotted routes behind, solid lines midground, labels foreground.
Scene 3 (2.6–4.2s): "One table —" lines reach the center station one after another; the station's ring tightens and the center dot pops in signal red with a single expanding ring; camera eases in slightly onto the station.
Scene 4 (4.2–5.0s): "— at seven fifteen." The clock lands on 7:15 and turns signal red; "Sangam, table for 4" label sets beside the station. Hold still.

narrativeRole: Opens on the outcome everyone wants from a group dinner plan: everyone actually arriving together.
keyMessage: Different starting points, one arrival time.

## Selected blueprint: spatial-pan-stations

# spatial-pan-stations — Spatial Pan / Stations

**intent**: Pre-place a sequence of labeled stations on one oversized canvas, then traverse it with a single virtual camera — repeated lateral/diagonal pans that center each station in turn and reveal a callout at every stop, landing held on a final station.

**roles served**

- Hook (from hook-pan-timeline): a horizontal timeline of evenly-spaced milestones, left-panned beat by beat, each marker getting a spring-popped callout, landing on the present moment ("evolution / milestone walk leading up to us").
- Problem (from problem-camera-pan-stations): a connected web of pain "stations" linked by hand-drawn leading lines, diagonally panned station to station, ending on a tangled scribble knot ("too many disconnected steps — it's a mess").
- Product_Intro (from concept-demo-decode-pan): a two-shot strip bridged by ONE lateral pan — shot 1 holds a static phrase whose accent word 3D-flap-DECODES (the concept lands), then the camera pans across the strip (with background parallax) into shot 2, where a cursor drives a live typing demo. Pairs this pan with `cursor-ui-demo`'s focal-locked tracked typing.

**duration**: 7–10s (union of Hook 8–10s, Problem ~7s, concept-demo ~7s)

**shot structure**
One oversized flat canvas on a solid `[bg color]`; all stations/markers pre-placed in world space; `[accent color]` text + simple line-icons; one virtual `.world` camera pans ease-in-out between stops. Each station holds ~1.0s.

- Scene 1 (0.0–~1.0s): Camera opens on station 1 — `[label 1 / first step]` centered. A reveal lands on it (see variants). Camera then begins to PAN toward station 2, sliding station 1 out of frame.
- Scene 2 → Scene N-1 (~1.0s each): Camera PANS (ease-in-out) to center the next station; on arrival its `[label k]` (+ optional `[secondary label]`) is REVEALED with the role reveal. Repeat per station.
- Scene N (final, ~last beat): One last pan lands on the terminal station; the final `[callout / landing element]` reveals and HOLDS to the end. Camera goes static on the punchline.

- Variant — Hook: stations sit as evenly-spaced `[markers]` on a thin horizontal `[timeline]` (lower third); pans are LEFT-only along the single axis (timeline scrolls left). Each callout is a bordered `[callout box]` + downward triangle (offset drop-shadow) that SPRING-POPS up (scale 0→100%, bouncy overshoot, transform-origin at triangle tip) reading `[label k]`; a `[secondary label, e.g. year]` fades in and RISES above it. Some mid markers arrive as plain static text revealed by the pan alone (no box). Final scene lands on the `[present-day label]`, springs, holds.
- Variant — Problem: stations are scattered across a 2D web; pans are DIAGONAL, STEERED by `[accent color]` hand-drawn lines — each station has a rough write-on line/arrow that draws toward the next and the camera follows it (Scene 1 also draws a loop/circle around the headline's key word). Each station = a white `[line-icon]` above its `[label]`, revealed plainly by the pan (no spring box). Final scene: the accent line spirals into a dense chaotic SCRIBBLE KNOT centered on the field; camera holds static on the tangle (visual punchline).

**motion vocabulary**
repeated ease-in-out camera pans (horizontal-left for Hook, diagonal-steered for Problem) across one large static canvas; pre-placed stations sliding through frame via the pan; spring-overshoot callout pop with triangle-tip origin (Hook); rise-and-fade secondary label (Hook); plain labels/icons arriving via the pan alone; rough hand-drawn "write-on" leading lines/arrows + loop/circle key-word mark (Problem); terminal chaotic-scribble knot draw (Problem); static hold on the final station/punchline.

**rule mapping**

- camera pan / traverse across the canvas (primary) → `viewport-change` (single `.world` wrapper transform; PAN mode)
- sequencing the repeated pan beats into stops → `multi-phase-camera`
- centering each station as the pan target → `coordinate-target-zoom` (used as pan-to-target, no zoom)
- spring-overshoot callout pop, triangle-tip origin (Hook) → `spring-pop-entrance`
- rise-and-fade secondary label + plain per-station label/icon reveals via the pan → `discrete-text-sequence`
- hand-drawn leading lines / arrows / loop-circle key-word mark / terminal scribble knot (Problem) → `svg-path-draw`
- station line-icons (Problem) → `svg-icon-enrichment`
- static hold on the final station / punchline → (no motion; sustained held frame, no rule needed)

**camera modifier**: The pan IS the camera. One `.world` virtual-camera transform in PAN mode — `viewport-change` — sequenced across stops by `multi-phase-camera`, each stop targeted via `coordinate-target-zoom` (pan-to-target). No depth push-in (that distinguishes this from the cluster-push-in / dataviz-pushthrough blueprints).
