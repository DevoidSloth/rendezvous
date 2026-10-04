"""Builds the README art: the animated header and the route diagram, in light and dark.

    python3 .github/readme/build.py

GitHub serves README images through <img>, which can't load web fonts, so the
fonts are subset and embedded. Animation is pure CSS, so prefers-reduced-motion
shows the finished frame. Needs fontTools and brotli (pip install fonttools brotli).
"""

import base64
import io
import math
import pathlib
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).parent
CACHE = HERE / ".fonts"

FONTS = {
    "display": "https://fonts.gstatic.com/s/bigshoulders/v4/qFdk35CPh40oITJ69S3GFqy5-BQAcbz7z7beObof__ytqyTi33thrko9yOT9AA.ttf",
    "text": "https://fonts.gstatic.com/s/atkinsonhyperlegiblenext/v7/NaP4cYPdHfdVxJw0IfIP0lvYFqijb-UxCtm5_wdGscKFt4tOOfV4ZmW33rQhtA.ttf",
    "text-bold": "https://fonts.gstatic.com/s/atkinsonhyperlegiblenext/v7/NaP4cYPdHfdVxJw0IfIP0lvYFqijb-UxCtm5_wdGscKFt4tOOfV4ZmW3C7MhtA.ttf",
}

# Same tokens as apps/web/src/styles.css.
THEMES = {
    "light": dict(bg="#eef1f4", bg2="#e2e7ed", ink="#0e1b2c", soft="#4a5868", rule="#c9d1da", signal="#e3262e",
                  l1="#2551e0", l2="#f57a12", l3="#8e3fd0", l4="#0d9a64", ghost=0.16),
    "dark": dict(bg="#0e1b2c", bg2="#132438", ink="#eef1f4", soft="#a4b1c0", rule="#2a3c52", signal="#ff4148",
                 l1="#6f8fff", l2="#ff9a3d", l3="#b77bf0", l4="#2cc58b", ghost=0.2),
}


def font_face(family: str, key: str, text: str, weight: int) -> str:
    CACHE.mkdir(exist_ok=True)
    src = CACHE / f"{key}.ttf"
    if not src.exists():
        src.write_bytes(urllib.request.urlopen(FONTS[key]).read())
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"@font-face{{font-family:'{family}';font-weight:{weight};src:url(data:font/woff2;base64,{b64}) format('woff2')}}"


def fonts_css(display: str, text: str) -> str:
    return "".join([
        font_face("BS", "display", display, 800),
        font_face("AH", "text", text, 500),
        font_face("AH", "text-bold", text, 700),
    ])


def rounded(points, r=26):
    """Straight runs with rounded corners, like apps/web/src/diagram.ts."""
    d = f"M{points[0][0]},{points[0][1]}"
    for i in range(1, len(points) - 1):
        (x0, y0), (x1, y1), (x2, y2) = points[i - 1], points[i], points[i + 1]
        l1, l2 = math.hypot(x1 - x0, y1 - y0), math.hypot(x2 - x1, y2 - y1)
        k = min(r, l1 / 2, l2 / 2)
        a = (x1 - (x1 - x0) / l1 * k, y1 - (y1 - y0) / l1 * k)
        b = (x1 + (x2 - x1) / l2 * k, y1 + (y2 - y1) / l2 * k)
        d += f" L{a[0]:.1f},{a[1]:.1f} Q{x1},{y1} {b[0]:.1f},{b[1]:.1f}"
    return d + f" L{points[-1][0]},{points[-1][1]}"


# The demo evening from apps/web/src/diagram.ts: four friends, one table at Sangam, 7:15 PM.
TABLE = (990, 224)
ARRIVE = 19 * 60 + 15
RIDERS = [
    dict(id="jason", name="Jason", src="North Campus", color="l1", minutes=26,
         points=[(652, 72), (838, 72), TABLE], label=(652, 114, "start")),
    dict(id="maya", name="Maya", src="Olin Library", color="l2", minutes=10,
         points=[(1204, 96), (1118, 96), TABLE], label=(1220, 46, "end")),
    dict(id="dev", name="Dev", src="Duffield Hall", color="l3", minutes=6,
         points=[(1090, 392), (1090, 324), TABLE], label=(1114, 388, "start")),
    dict(id="ana", name="Ana", src="The Commons", color="l4", minutes=15,
         points=[(704, 392), (822, 392), TABLE], label=(682, 388, "end")),
]

CYCLE = 12.0          # seconds per loop
T0, TA = 0.7, 8.2     # clock starts, everyone arrives
START = ARRIVE - max(r["minutes"] for r in RIDERS) - 3
SPAN = ARRIVE - START
FADE = (94.0, 98.5)   # percent of the cycle where the evening fades before looping


def clock(m: int) -> str:
    return f"{(m // 60) % 12 or 12}:{m % 60:02d}"


def pct(t: float) -> str:
    return f"{t / CYCLE * 100:.2f}%"


def at(minute: float) -> float:
    return T0 + (minute - START) / SPAN * (TA - T0)


def header(theme: str) -> str:
    c = THEMES[theme]
    W, H = 1280, 440
    css = []
    body = []

    # Rider lines, walkers and origins.
    ghosts, lines, walkers, origins, labels = [], [], [], [], []
    for r in RIDERS:
        d = rounded(r["points"])
        L = 100  # pathLength, so the dash and offset-distance share one measure
        leave = ARRIVE - r["minutes"]
        s, e = at(leave), at(ARRIVE)
        col = c[r["color"]]
        ghosts.append(f'<path d="{d}" stroke="{col}"/>')
        lines.append(f'<path class="ln ln-{r["id"]}" d="{d}" stroke="{col}" pathLength="100" stroke-dasharray="100 100"/>')
        walkers.append(f'<circle class="wk wk-{r["id"]}" r="12" fill="{col}" style="offset-path:path(\'{d}\')"/>')
        ox, oy = r["points"][0]
        origins.append(f'<circle class="og og-{r["id"]}" cx="{ox}" cy="{oy}" r="9" stroke="{col}" style="--c:{col}"/>')
        lx, ly, anchor = r["label"]
        labels.append(
            f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" class="nm">{r["name"]}</text>'
            f'<text x="{lx}" y="{ly + 21}" text-anchor="{anchor}" class="fr">{r["src"]} · {clock(leave)}</text>'
        )
        css.append(
            f'.ln-{r["id"]}{{animation-name:ln-{r["id"]}}}'
            f'@keyframes ln-{r["id"]}{{0%,{pct(s)}{{stroke-dashoffset:{L:.0f};opacity:1}}{pct(e)},{FADE[0]}%{{stroke-dashoffset:0;opacity:1}}'
            f'{FADE[1]}%,100%{{stroke-dashoffset:0;opacity:0}}}}'
            f'.wk-{r["id"]}{{animation-name:wk-{r["id"]}}}'
            f'@keyframes wk-{r["id"]}{{0%,{pct(s)}{{offset-distance:0%;opacity:0}}{pct(s + 0.01)}{{opacity:1}}'
            f'{pct(e)}{{offset-distance:100%;opacity:1}}{pct(e + 0.35)},100%{{offset-distance:100%;opacity:0}}}}'
            f'.og-{r["id"]}{{animation-name:og-{r["id"]}}}'
            f'@keyframes og-{r["id"]}{{0%,{pct(s)}{{fill:{c["bg"]}}}{pct(s + 0.25)},{FADE[0]}%{{fill:{col}}}{FADE[1]}%,100%{{fill:{c["bg"]}}}}}'
        )

    # Clock: a strip of minutes behind a one-line window, stepped once a minute.
    CLK_X, CLK_Y, STEP = 64, 338, 70
    strip = "".join(
        f'<text x="{CLK_X}" y="{CLK_Y + i * STEP}" class="ck">{clock(START + i)}</text>' for i in range(SPAN + 1)
    )
    frames = [f"0%{{transform:translateY(0)}}"]
    for i in range(1, SPAN + 1):
        frames.append(f"{pct(at(START + i))}{{transform:translateY({-i * STEP}px)}}")
    frames.append(f"{FADE[1]}%{{transform:translateY({-SPAN * STEP}px)}}")
    frames.append(f"100%{{transform:translateY(0)}}")
    css.append(
        f".strip{{transform:translateY({-SPAN * STEP}px);animation:strip {CYCLE}s step-end infinite}}"
        f"@keyframes strip{{{''.join(frames)}}}"
    )

    a = pct(TA)
    css.append(
        # Status line swaps when everyone's in.
        f".st-go{{opacity:0;animation:st-go {CYCLE}s linear infinite}}"
        f"@keyframes st-go{{0%,{a}{{opacity:1}}{pct(TA + 0.3)},{FADE[1]}%{{opacity:0}}100%{{opacity:1}}}}"
        f".st-in{{animation:st-in {CYCLE}s linear infinite}}"
        f"@keyframes st-in{{0%,{a}{{opacity:0}}{pct(TA + 0.3)},{FADE[0]}%{{opacity:1}}{FADE[1]}%,100%{{opacity:0}}}}"
        # The pin pings twice on arrival.
        f".ping{{opacity:0;transform-box:fill-box;transform-origin:center;animation:ping {CYCLE}s cubic-bezier(.2,.7,.3,1) infinite}}"
        f".ping2{{animation-delay:.45s}}"
        f"@keyframes ping{{0%,{pct(TA - 0.05)}{{opacity:0;transform:scale(1)}}{a}{{opacity:.75;transform:scale(1)}}"
        f"{pct(TA + 1.6)},100%{{opacity:0;transform:scale(3.6)}}}}"
        f".pin{{transform-box:fill-box;transform-origin:center;animation:pin {CYCLE}s cubic-bezier(.3,1.6,.5,1) infinite}}"
        f"@keyframes pin{{0%,{a}{{transform:scale(1)}}{pct(TA + 0.18)}{{transform:scale(1.22)}}{pct(TA + 0.6)},100%{{transform:scale(1)}}}}"
        f".tb{{animation:tb {CYCLE}s linear infinite}}"
        f"@keyframes tb{{0%,{a}{{fill:{c['soft']}}}{pct(TA + 0.3)},{FADE[0]}%{{fill:{c['signal']}}}{FADE[1]}%,100%{{fill:{c['soft']}}}}}"
    )

    display_text = "Rendezvous Four routes, one table. 0123456789:"
    text_text = "".join(sorted(set(
        "".join(r["name"] + r["src"] for r in RIDERS)
        + "0123456789:·,.' PM tonight Everyone's at the table Sangam Table for 4 iMessage agent TABLEFOR.US BIGRED//HACKS 2026 On the way"
    )))

    style = (
        fonts_css(display_text, text_text)
        + f".bs{{font-family:BS,'Arial Narrow',sans-serif;font-weight:800}}"
        f".ah,.nm,.fr,.eb,.st,.tn,.tt{{font-family:AH,ui-sans-serif,system-ui,sans-serif}}"
        f".wm{{font-size:132px;fill:{c['ink']};letter-spacing:-1px}}"
        f".tg{{font-size:48px}}"
        f".eb{{font-size:14px;font-weight:700;letter-spacing:2.6px;fill:{c['soft']}}}"
        f".ck{{font-family:BS,'Arial Narrow',sans-serif;font-weight:800;font-size:64px;fill:{c['ink']}}}"
        f".st{{font-size:19px;font-weight:700}}"
        f".nm{{font-size:17px;font-weight:700;fill:{c['ink']}}}"
        f".fr{{font-size:14px;font-weight:500;fill:{c['soft']}}}"
        f".tn{{font-size:19px;font-weight:700;fill:{c['ink']}}}"
        f".tt{{font-size:14px;font-weight:500}}"
        f".gh path{{fill:none;stroke-width:10;stroke-linecap:round;opacity:{c['ghost']}}}"
        f".ln{{fill:none;stroke-width:10;stroke-linecap:round;stroke-dashoffset:0}}"
        f".wk{{opacity:0;offset-rotate:0deg;stroke:{c['bg']};stroke-width:4}}"
        f".og{{fill:var(--c);stroke-width:5}}"
        f".ln,.wk,.og{{animation-duration:{CYCLE}s;animation-timing-function:linear;animation-iteration-count:infinite}}"
        + "".join(css)
        + "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"
    )

    px, py = TABLE
    body = f"""
  <defs>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="{c['rule']}"/></pattern>
    <radialGradient id="fade" cx="{px / W:.3f}" cy="{py / H:.3f}" r="0.42"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="m"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
    <clipPath id="frame"><rect width="{W}" height="{H}" rx="22"/></clipPath>
    <clipPath id="win"><rect x="{CLK_X - 4}" y="{CLK_Y - 56}" width="140" height="68"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="{W}" height="{H}" fill="{c['bg']}"/>
    <rect width="{W}" height="{H}" fill="url(#dots)" mask="url(#m)"/>

    <text x="66" y="76" class="eb">IMESSAGE AGENT · TABLEFOR.US</text>
    <text x="60" y="200" class="bs wm">Rendezvous</text>
    <text x="64" y="256" class="bs tg"><tspan fill="{c['soft']}">Four routes,</tspan> <tspan fill="{c['ink']}">one table.</tspan></text>

    <g clip-path="url(#win)"><g class="strip">{strip}</g></g>
    <text x="{CLK_X + 132}" y="{CLK_Y - 22}" class="st" fill="{c['soft']}">PM</text>
    <text x="{CLK_X + 132}" y="{CLK_Y + 2}" class="st st-go" fill="{c['soft']}">On the way</text>
    <text x="{CLK_X + 132}" y="{CLK_Y + 2}" class="st st-in" fill="{c['signal']}">Everyone's at the table</text>

    <g class="gh">{''.join(ghosts)}</g>
    <g>{''.join(lines)}</g>
    <g>{''.join(origins)}</g>
    <g>{''.join(labels)}</g>
    <g>{''.join(walkers)}</g>

    <circle class="ping" cx="{px}" cy="{py}" r="20" fill="none" stroke="{c['signal']}" stroke-width="3"/>
    <circle class="ping ping2" cx="{px}" cy="{py}" r="20" fill="none" stroke="{c['signal']}" stroke-width="2"/>
    <g class="pin">
      <circle cx="{px}" cy="{py}" r="25" fill="{c['ink']}"/>
      <circle cx="{px}" cy="{py}" r="17" fill="{c['bg']}"/>
      <circle cx="{px}" cy="{py}" r="11" fill="{c['signal']}"/>
    </g>
    <text x="{px + 40}" y="{py - 2}" class="tn">Sangam</text>
    <text x="{px + 40}" y="{py + 19}" class="tt tb">Table for 4 · 7:15 PM</text>
  </g>"""

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
        f'aria-label="Rendezvous. Four routes, one table. Four friends leave from different places at different times and all arrive at Sangam at 7:15 PM.">'
        f"<title>Rendezvous: four routes, one table</title><style>{style}</style>{body}</svg>\n"
    )


STATIONS = [
    ("Mention", ["“@Rendezvous dinner", "tonight, under $15”"]),
    ("Plan", ["Fairest walk for everyone,", "inside every budget"]),
    ("Approve", ["A thumbs-up from each", "person locks the plan"]),
    ("Call", ["Grok Voice phones the", "venue and books it"]),
    ("Leave", ["Each person gets a DM", "when it's time to go"]),
    ("Split", ["Everyone confirms, and", "Nessie settles the bill"]),
]


def route(theme: str) -> str:
    c = THEMES[theme]
    W, H, Y = 1280, 330, 196
    xs = [112 + i * 211 for i in range(len(STATIONS))]
    seg_colors = [c["l1"], c["l2"], c["l3"], c["l4"], c["signal"]]

    segs = "".join(f'<path d="M{a},{Y} L{b},{Y}" stroke="{col}"/>' for a, b, col in zip(xs, xs[1:], seg_colors))
    # Branches run under the line: a change sends the plan back, and venues that don't need a call skip it.
    back = (xs[1] + 34, xs[2] - 34)
    skip = (xs[2] + 34, xs[4] - 34)
    branches = "".join(
        f'<path class="br" d="M{a},{Y + 12} C{a},{Y + 86} {b},{Y + 86} {b},{Y + 12}"/>'
        f'<text x="{(a + b) / 2}" y="{Y + 104}" text-anchor="middle" class="b">{label}</text>'
        for (a, b), label in [(back, "reply with a change"), (skip, "no call needed")]
    )
    stations = []
    for i, ((name, lines), x) in enumerate(zip(STATIONS, xs)):
        if i == len(STATIONS) - 1:
            dot = (f'<circle cx="{x}" cy="{Y}" r="21" fill="{c["ink"]}"/><circle cx="{x}" cy="{Y}" r="14" fill="{c["bg"]}"/>'
                   f'<circle cx="{x}" cy="{Y}" r="9" fill="{c["signal"]}"/>')
        else:
            dot = f'<circle cx="{x}" cy="{Y}" r="13" fill="{c["bg"]}" stroke="{c["ink"]}" stroke-width="6"/>'
        stations.append(
            f'<text x="{x}" y="{Y - 140}" text-anchor="middle" class="n">0{i + 1}</text>'
            f'<text x="{x}" y="{Y - 98}" text-anchor="middle" class="bs h">{name}</text>'
            + "".join(f'<text x="{x}" y="{Y - 68 + j * 20}" text-anchor="middle" class="d">{t}</text>' for j, t in enumerate(lines))
            + dot
        )

    display_text = "".join(n for n, _ in STATIONS)
    text_text = "".join(sorted(set("".join("".join(l) for _, l in STATIONS) + "0123456789 reply with a change no call needed")))
    style = (
        fonts_css(display_text, text_text)
        + f".bs{{font-family:BS,'Arial Narrow',sans-serif;font-weight:800}}"
        f".h{{font-size:36px;fill:{c['ink']}}}"
        f".n,.d,.b{{font-family:AH,ui-sans-serif,system-ui,sans-serif}}"
        f".n{{font-size:13px;font-weight:700;letter-spacing:2px;fill:{c['soft']}}}"
        f".d{{font-size:15px;font-weight:500;fill:{c['soft']}}}"
        f".b{{font-size:14px;font-weight:700;fill:{c['soft']}}}"
        f".seg path{{fill:none;stroke-width:10;stroke-linecap:round}}"
        f".br{{fill:none;stroke:{c['soft']};stroke-width:3.5;stroke-dasharray:.5 10;stroke-linecap:round}}"
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
        f'aria-label="How it works: mention, plan, approve, call, leave, split. A reply with a change sends the plan back, and venues that don\'t need a call skip it.">'
        f"<title>How Rendezvous works</title><style>{style}</style>"
        f'<rect width="{W}" height="{H}" rx="22" fill="{c["bg"]}"/>'
        f'{branches}<g class="seg">{segs}</g>{"".join(stations)}'
        f"</svg>\n"
    )


if __name__ == "__main__":
    for theme in THEMES:
        (HERE / f"header-{theme}.svg").write_text(header(theme))
        (HERE / f"route-{theme}.svg").write_text(route(theme))
    for p in sorted(HERE.glob("*.svg")):
        print(f"{p.name:22} {p.stat().st_size / 1024:6.1f} KB")
