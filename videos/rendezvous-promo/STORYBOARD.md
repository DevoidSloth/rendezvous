---
format: 1920x1080
duration: 30s
message: "Rendezvous gets your friends to the same table at the same time, from one text."
arc: Demo Loop — hook → product intro → fair spot → booking call → leave-by texts → bill → CTA
audience: hackathon judges and college students
mode: autonomous
music: warm upbeat indie pop, light marimba and claps, hopeful, no vocals
---

## Video direction

- **palette system** — ground `cream` (#EEF1F4 enamel grey) on every frame; ink `black` (#0E1B2C) for all type; the four friends always keep their own line color (`line-jason` cobalt, `line-maya` tangerine, `line-dev` violet, `line-ana` emerald) for routes, origin dots and their name labels; `coral` (signal red #E3262E) is scarce: only the destination dot, the arrival clock turning red, and the closing URL. The phone is the one realistic object: light iPhone, iMessage blue #0A84FF outgoing / #E9E9EE incoming.
- **type** — display role (Big Shoulders 900, sentence case) for headlines, times and amounts; body role (Atkinson Hyperlegible Next) for labels and chat text. `tabular-nums` on every clock and amount.
- **the line grammar** — every route is a thick line with round caps, straight runs, 45° bends and rounded corners, drawn on with an SVG self-draw (→ `svg-path-draw`); every destination is a station: platform-colored circle, thick ink ring, signal-red dot. This grammar is the film's through-line; it appears in frames 1, 3, 5 and 7.
- **motion grammar + reveal model** — long-tail `power3` settles everywhere, smooth over bouncy (spring overshoot only on the arrival dot and the tapback/checkmark pops). Every frame reveals each piece on its spoken cue; nothing enters before the voiceover names it. Holds stay still; subtle jitter at most.
- **rhythm** — frames 1 and 3 are the motion-rich set pieces; frame 2 is quick and tactile; frame 4 is busy theater; frame 5 echoes frame 1 at a smaller scale; frame 6 is the breather (one cascade, then a still hold); frame 7 holds still on the lockup for its last second.
- **negative list** — no diagonal hatch, no all-caps or tracked labels, no gradients, glows on the ground, bokeh, or "AI" purple-blue washes; no stock icons where a line or station would do; no browser chrome. Both failure modes are banned: slideshow (front-load then freeze) and screensaver (everything floating independently).
- **caption band** — all content in the top ~83%; the bottom band stays clear for captions.

## Frame 1 — Four routes, one table

- scene: Four colored transit lines draw in from four corners at four different times and meet at one red station as a clock runs to 7:15
- voiceover: "Four friends. Four routes. One table — at seven fifteen."
- duration: 3.989s
- transition_in: cut
- status: animated
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

## Frame 2 — Just text it

- scene: An iMessage thread; "dinner tonight, under $15 each, with Maya, Dev and Ana" types into the composer and sends to Rendezvous, which answers "On it."
- voiceover: "Just text Rendezvous what you want — and who's coming."
- duration: 2.965s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-just-text-it.html
- type: product_intro
- persuasion: Friction reduction
- beat: ease
- asset_candidates: assets/logo-fb651fa0.svg — Rendezvous mark (four short colored lines meeting at a red dot), for the contact avatar

- blueprint: prompt-type-submit-generate (Adapt)
- focal: assets/logo-fb651fa0.svg
- roles: logo-fb651fa0 = supporting (the contact avatar at the top of the thread)
- registry: message-thread-reveal — install with `npx hyperframes add message-thread-reveal` and restyle to frame.md (light iPhone, iMessage bubble colors, system font); do not rebuild the phone by hand
- sfx: keyboard-typing, message-send

Adapt: keep the signature — the ask types live into the real input and submits, and the machine answers — on an iMessage thread instead of a web composer.
Scene 1 (0.0–0.6s): A light iPhone, right-of-center (asymmetric 40/60: headline left, phone right), thread header "Rendezvous" with the logo avatar; an empty composer. Left: display-role headline "Just text it." types on.
Scene 2 (0.6–2.4s): "Just text Rendezvous what you want —" the composer types "dinner tonight, under $15 each" with a caret.
Scene 3 (2.4–3.2s): "— and who's coming." the typing continues ", with Maya, Dev and Ana"; the three names tint in their line colors as they type; the send button presses and the blue bubble lifts into the thread.
Scene 4 (3.2–4.0s): A gray reply bubble pops: "On it. Checking calendars, budgets and walks." Hold.

narrativeRole: Names the product and the whole interface in one move: it's just a text.
keyMessage: One text starts the plan; no app.

## Frame 3 — The fairest spot

- scene: The Ithaca map with four walking routes; walk times tick in (30, 11, 7, 17 min) and Sangam lands as the pick, "longest walk as short as it gets"
- voiceover: "It checks calendars, budgets, and every walk — then picks the fairest spot."
- duration: 4.523s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-fairest-spot.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: clarity + trust
- asset_candidates: assets/svg-893ddac3.svg — the site's Ithaca map (lake, gorges, campus, Collegetown, the Commons) with friends' positions

- blueprint: camera-journey (Adapt)
- focal: assets/svg-893ddac3.svg
- roles: svg-893ddac3 = background (the Ithaca map; rebuild its contours, lake, creeks and streets as the world, dim ~70% so routes read on top)
- sfx: soft-pop, chime

Adapt: keep the signature — the viewport camera as storyteller across one continuous world, a multi-leg journey ending in a landing push — across the Ithaca map: from the four friends to the chosen spot.
Scene 1 (0.0–1.2s): "It checks calendars," map world fills the frame; four friend dots in their colors at North Campus, Olin Library, Duffield Hall and the Commons; a compact checklist card upper-left ticks "Calendars".
Scene 2 (1.2–2.2s): "budgets," the card ticks "Budgets"; candidate restaurant pins (small ink rings) dot Collegetown and the Commons.
Scene 3 (2.2–3.4s): "and every walk —" four routes self-draw from each friend to one candidate, each with its walk time label (30, 11, 7, 17 min) appearing at the route's end; camera drifts toward Collegetown.
Scene 4 (3.4–5.0s): "then picks the fairest spot." the camera lands with a push onto Sangam; the station dot turns signal red and a label sets: "Sangam, 6:45 PM — longest walk 30 min, the shortest it gets". Hold.

narrativeRole: Shows the planning brain, and that it's fair to everyone rather than convenient for one person.
keyMessage: Fair to every walk, inside everyone's budget and free time.

## Frame 4 — It books the table

- scene: A call card "Calling Sangam…" with a waveform; the host's question "Booth or window?" pops into the chat as options 1/2; a reply "1" lands; the card stamps "Booked, 6:45 PM"
- voiceover: "If they take reservations, it calls — and asks you anything it can't answer."
- duration: 4.736s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-books-the-table.html
- type: feature_showcase
- persuasion: Value stacking
- beat: relief + control
- asset_candidates:

- blueprint: agent-progress-theater (Adapt)
- focal: (none — typography and UI)
- roles: (none)
- registry: message-thread-reveal (the phone half) · success-check (the booked stamp) — install both and restyle to frame.md
- sfx: phone-ring, notification, success-chime

Adapt: keep the signature — the machine visibly works, then the receipt checks off — as a phone call card whose one question round-trips through the chat.
Scene 1 (0.0–1.4s): "If they take reservations, it calls —" split-screen 50/50: left, a call card "Calling Sangam…" with a live four-color waveform pulsing; right, the phone thread.
Scene 2 (1.4–3.0s): "and asks you anything" the host's line appears in the call card ("Booth or a table by the window?") and the same question pops into the phone thread as "1. Booth  2. Window".
Scene 3 (3.0–4.2s): "it can't answer." a blue reply bubble "1" lands; the call card waveform resumes.
Scene 4 (4.2–5.0s): the call card stamps a checkmark: "Booked: 6:45 PM, booth for 4". Hold.

narrativeRole: The moment nobody wants to do (calling the restaurant) handled for you, with you still in control.
keyMessage: It makes the call; you only answer what matters.

## Frame 5 — Leave on time

- scene: A departures board: Jason leaves 6:15, Ana 6:28, Maya 6:34, Dev 6:38; each line starts at its own time and all four arrive at one red dot as the clock hits 6:45
- voiceover: "Everyone gets a text right when it's time to leave — timed to their own walk."
- duration: 4.437s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-leave-on-time.html
- type: benefit_highlight
- persuasion: Feature-to-benefit translation
- beat: confidence
- asset_candidates:

- blueprint: spatial-pan-stations (Adapt)
- focal: (none — diagram)
- roles: (none)
- sfx: notification, chime

Adapt: keep the stations-on-one-canvas signature, landing held on the final station; the stations are the four leave times on a horizontal time axis, all converging on the arrival station.
Scene 1 (0.0–1.0s): "Everyone gets a text" a departures board, left-aligned: four rows of origin dots and labels ("Jason leaves 6:15", "Ana 6:28", "Maya 6:34", "Dev 6:38") positioned along a time axis; a clock "6:15 PM" right; a small iMessage notification banner "Jason, leave by 6:15…" slides down top-right.
Scene 2 (1.0–3.0s): "when it's time to leave." each row's line self-draws from its own leave time toward a single arrival station at the right as the clock advances; lines start in order Jason, Ana, Maya, Dev.
Scene 3 (3.0–4.0s): all four lines arrive together; the station dot pops signal red; the clock lands "6:45 PM" in signal red. Hold.

narrativeRole: Pays off the hook's promise: the different routes really do arrive together.
keyMessage: Staggered departures, one arrival.

## Frame 6 — The bill splits itself

- scene: "Jason paid $52" with three rows (Maya, Dev, Ana → Jason $13.00) that each check off "Sent"
- voiceover: "And after dinner? The bill splits itself — everyone pays back their share with one tap."
- duration: 5.355s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-bill-splits.html
- type: benefit_highlight
- persuasion: Risk reversal
- beat: peace of mind
- asset_candidates:

- blueprint: grid-card-assemble (Adapt)
- focal: (none — typography)
- roles: (none)
- registry: success-check — the per-row "Sent" check; restyle the ring and path to line-ana emerald
- sfx: cash-register, checkmark-pop

Adapt: keep the staggered self-assembly of a list that then holds; the list is three ledger rows that each check off.
Scene 1 (0.0–1.2s): "After dinner," asymmetric 40/60: left, "Jason paid" label over a huge "$52" in display role.
Scene 2 (1.2–2.4s): "the bill splits itself." right, three ledger rows cascade in (Maya → Jason $13.00, Dev → Jason $13.00, Ana → Jason $13.00), each with its friend's color dot.
Scene 3 (2.4–3.5s): a green "Sent" check pops on each row in turn. Hold still (the breather).

narrativeRole: Removes the last awkward part of a group dinner.
keyMessage: Everyone pays back their own share with one tap.

## Frame 7 — A table for us

- scene: The logo's four short lines converge on the red dot, "Rendezvous" sets in big, then "tablefor.us"
- voiceover: "Rendezvous. A table for us — at tablefor dot us."
- duration: 3.221s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/07-table-for-us.html
- type: cta
- persuasion: Brand recall
- beat: triumph
- asset_candidates: assets/logo-fb651fa0.svg — Rendezvous mark (four colored lines meeting at a red dot)

- blueprint: logo-assemble-lockup (Reproduce)
- focal: assets/logo-fb651fa0.svg
- roles: logo-fb651fa0 = cutout (the brand mark, rendered large and centered)
- sfx: chime

Reproduce: the mark comes to exist from its parts — its four colored lines draw in from four directions and meet as the red dot springs in — then the wordmark and URL set.
Scene 1 (0.0–1.2s): "Rendezvous." centered on bare ground: the four short lines of the mark self-draw inward and the red station dot springs in at center; the wordmark "Rendezvous" sets below in display role.
Scene 2 (1.2–2.4s): "A table for us." the URL "tablefor.us" sets under the wordmark in signal red, body role, bold.
Scene 3 (2.4–3.5s): hold still on the full lockup.

narrativeRole: Lands the brand and where to find it.
keyMessage: Rendezvous, at tablefor.us.
