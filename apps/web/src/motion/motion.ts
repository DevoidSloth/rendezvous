import { roundedPath, type P } from "../diagram";
import "./motion.css";

/**
 * The Rendezvous motion piece, 1920×1080. Every frame is a pure function of
 * time: `window.__render(t)` draws the frame at t seconds, so the recorder can
 * step through it frame by frame. Opening the page plays it in real time.
 */

export const DURATION = 33;

// ───────────────────────── helpers ─────────────────────────

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** Progress of t through [a, b], 0..1. */
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const backOut = (x: number) => {
  const c = 1.7;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const clock = (mins: number) => {
  const m = Math.floor(mins);
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}`;
};

const NS = "http://www.w3.org/2000/svg";
const COLORS = ["var(--l1)", "var(--l2)", "var(--l3)", "var(--l4)"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}
const show = (e: HTMLElement | SVGElement, o: number, tx = 0, ty = 0, s = 1) => {
  e.style.opacity = String(o);
  e.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
};

// ───────────────────────── stage ─────────────────────────

const stage = document.getElementById("stage")!;

/** Scene layers; each is shown only during its time range. */
const scenes = {
  map: el("div", "scene", stage),
  phone: el("div", "scene", stage),
  depart: el("div", "scene", stage),
  bill: el("div", "scene", stage),
  end: el("div", "scene", stage),
};

// ── Scene 1–2: four routes converge on the table, then the title sets in ──

const CENTER: P = [960, 540];
const ROUTES: Array<{ name: string; from: string; minutes: number; pts: P[]; label: P; anchor: "start" | "end" }> = [
  { name: "Jason", from: "North Campus", minutes: 26, pts: [[-60, 170], [690, 170], [960, 440], CENTER], label: [80, 88], anchor: "start" },
  { name: "Maya", from: "Olin Library", minutes: 10, pts: [[1980, 300], [1480, 300], [1240, 540], CENTER], label: [1840, 218], anchor: "end" },
  { name: "Dev", from: "Duffield Hall", minutes: 6, pts: [[1980, 930], [1300, 930], [960, 640], CENTER], label: [1840, 994], anchor: "end" },
  { name: "Ana", from: "The Commons", minutes: 15, pts: [[-60, 840], [560, 840], [800, 540], CENTER], label: [80, 904], anchor: "start" },
];
const ARRIVE = 19 * 60 + 15;

const mapSvg = svgEl("svg", { viewBox: "0 0 1920 1080", class: "full" }, scenes.map);
const mapGroup = svgEl("g", {}, mapSvg);
const routes = ROUTES.map((r, i) => {
  const d = roundedPath(r.pts, 60);
  svgEl("path", { d, class: "ghost", stroke: COLORS[i]! }, mapGroup);
  const path = svgEl("path", { d, class: "route", stroke: COLORS[i]! }, mapGroup);
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len} ${len}`;
  const walker = svgEl("circle", { r: 20, class: "walker", fill: COLORS[i]! }, mapGroup);
  const name = svgEl("text", { x: r.label[0], y: r.label[1], "text-anchor": r.anchor, class: "route-name" }, mapGroup);
  name.textContent = r.name;
  const from = svgEl("text", { x: r.label[0], y: r.label[1] + 34, "text-anchor": r.anchor, class: "route-from" }, mapGroup);
  from.textContent = `${r.from}, leaves ${clock(ARRIVE - r.minutes)}`;
  return { ...r, path, len, walker, name, from };
});
const table = svgEl("g", {}, mapGroup);
const tableRing = svgEl("circle", { r: 70, class: "table-ring" }, table);
svgEl("circle", { r: 48, class: "table-station" }, table);
const tableDot = svgEl("circle", { r: 24, class: "table-dot" }, table);
const bigClock = el("div", "big-clock", scenes.map);
const title = el("h1", "title", scenes.map, `<span>Four routes,</span><span>one table<i class="period"></i></span>`);
const titleLines = [...title.querySelectorAll("span")] as HTMLElement[];
const period = title.querySelector(".period") as HTMLElement;

function renderMap(t: number) {
  // 0–4.6s: the clock runs 6:46 → 7:15 and each friend walks their own line.
  const start = ARRIVE - 29;
  const now = lerp(start, ARRIVE, easeOut(seg(t, 0.3, 4.4)));
  for (const r of routes) {
    const p = clamp((now - (ARRIVE - r.minutes)) / r.minutes);
    r.path.style.strokeDashoffset = String(r.len * (1 - p));
    const pt = r.path.getPointAtLength(r.len * p);
    r.walker.setAttribute("cx", String(pt.x));
    r.walker.setAttribute("cy", String(pt.y));
    r.walker.style.opacity = p > 0 && p < 1 ? "1" : "0";
    const labelIn = seg(t, 0.1, 0.6);
    const waiting = now < ARRIVE - r.minutes;
    r.name.style.opacity = r.from.style.opacity = String(labelIn * (waiting ? 0.45 : 1) * (1 - seg(t, 4.7, 5.1)));
  }
  const arrived = now >= ARRIVE - 0.01;
  tableDot.setAttribute("class", arrived ? "table-dot on" : "table-dot");
  const pop = seg(t, 4.4, 5.4);
  tableRing.style.opacity = String(arrived ? 1 - pop : 0);
  tableRing.setAttribute("r", String(70 + 120 * easeOut(pop)));
  table.setAttribute("transform", `translate(${CENTER[0]} ${CENTER[1]}) scale(${arrived ? 1 + 0.18 * Math.sin(Math.PI * seg(t, 4.4, 4.75)) : 1})`);

  bigClock.textContent = clock(now);
  bigClock.classList.toggle("on", arrived);
  const clockOut = easeInOut(seg(t, 4.8, 5.4));
  show(bigClock, seg(t, 0.15, 0.5) * (1 - clockOut), 0, -30 * clockOut);

  // 4.8–6s: the diagram slides right and shrinks; the title sets in on the left.
  const move = easeInOut(seg(t, 4.8, 6));
  // Scale about the table so it lands at (1460, 560).
  const s = lerp(1, 0.48, move);
  mapGroup.setAttribute("transform", `translate(${lerp(CENTER[0], 1460, move)} ${lerp(CENTER[1], 560, move)}) scale(${s}) translate(${-CENTER[0]} ${-CENTER[1]})`);
  titleLines.forEach((l, i) => {
    const x = easeOut(seg(t, 5.3 + i * 0.22, 6.1 + i * 0.22));
    show(l, x, 0, 60 * (1 - x));
  });
  const pin = backOut(seg(t, 6.3, 6.8));
  period.style.transform = `scale(${pin})`;
}

// ── Scenes 3–5: the phone ──

const phoneCaption = el("div", "caption", scenes.phone);
const captions = ["Text it what you want.", "It finds the fairest spot.", "It calls to book the table."];
const captionEls = captions.map((c) => el("h2", "caption-line", phoneCaption, c));
const captionSub = el("div", "caption-subs", scenes.phone);
const subs = [
  "No app. It's just iMessage.",
  "Free/busy, budgets and every walk. The longest walk is as short as it can be.",
  "Grok Voice says it's an AI, books the table, and asks you anything it can't answer.",
].map((c) => el("p", "caption-sub", captionSub, c));

const phone = el("div", "phone", scenes.phone);
el("div", "phone-top", phone, `<span>5:41</span><b>Rendezvous</b><span class="bat"></span>`);
const thread = el("div", "thread", phone);

interface Bubble {
  at: number;
  out?: boolean;
  html: string;
  thumbs?: Array<number>;
  el?: HTMLElement;
  tap?: HTMLElement;
}
const BUBBLES: Bubble[] = [
  { at: 9.0, out: true, html: "dinner tonight, under $15 each, with Maya, Dev and Ana" },
  { at: 10.2, html: "On it. Checking calendars, budgets and walks." },
  {
    at: 12.3,
    html: "How about this: <b>Sangam Indian Cuisine</b>, tonight at 6:45 PM.<br>Walks: Jason 30 min, Maya 11, Dev 7, Ana 17.<br>React 👍 to lock it in.",
    thumbs: [13.4, 13.8, 14.2, 14.6],
  },
  { at: 16.4, html: "The host is asking: booth or a table by the window?<br>1. Booth<br>2. Table by the window" },
  { at: 17.6, out: true, html: "1" },
  { at: 18.5, html: "Table booked: Sangam at 6:45 PM. Booth for 4, under Jason. ✓" },
];
for (const b of BUBBLES) {
  b.el = el("div", `bubble ${b.out ? "out" : "in"}`, thread, b.html);
  if (b.thumbs) b.tap = el("span", "tap", b.el, "👍");
}
const waveform = el("div", "wave", scenes.phone);
const bars = Array.from({ length: 28 }, () => el("i", "", waveform));
bars.forEach((b, i) => (b.style.background = COLORS[i % 4]!));
const callLabel = el("div", "call-label", scenes.phone, "Calling Sangam…");

function renderPhone(t: number) {
  const which = t < 12 ? 0 : t < 16 ? 1 : 2;
  captionEls.forEach((c, i) => {
    const local = i === which ? easeOut(seg(t, [8.2, 12, 16][i]!, [8.9, 12.7, 16.7][i]!)) : 0;
    show(c, local, 0, 40 * (1 - local));
    show(subs[i]!, i === which ? easeOut(seg(t, [8.5, 12.3, 16.3][i]!, [9.2, 13, 17][i]!)) : 0);
  });
  const enter = easeOut(seg(t, 8, 8.9));
  show(phone, enter, 140 * (1 - enter), 0);
  let height = 0;
  for (const b of BUBBLES) {
    const x = seg(t, b.at, b.at + 0.4);
    b.el!.style.display = x > 0 ? "" : "none";
    show(b.el!, x, 0, 18 * (1 - x), 0.92 + 0.08 * backOut(x));
    if (x > 0) height += b.el!.offsetHeight + 12;
    if (b.tap && b.thumbs) {
      const n = b.thumbs.filter((at) => t >= at).length;
      b.tap.textContent = n ? `👍${n > 1 ? ` ${n}` : ""}` : "";
      const pop = Math.max(0, ...b.thumbs.map((at) => (t >= at && t < at + 0.3 ? Math.sin(Math.PI * seg(t, at, at + 0.3)) : 0)));
      b.tap.style.opacity = n ? "1" : "0";
      b.tap.style.transform = `scale(${1 + 0.35 * pop})`;
    }
  }
  // Keep the newest bubble in view.
  thread.style.transform = `translateY(${-Math.max(0, height - 620)}px)`;
  const call = seg(t, 16, 16.5) * (1 - seg(t, 19.3, 19.8));
  show(waveform, call);
  show(callLabel, call);
  bars.forEach((b, i) => {
    const h = 0.25 + 0.75 * Math.abs(Math.sin(t * (5 + (i % 5)) + i * 1.7)) * (t > 17.4 && t < 18.2 ? 0.25 : 1);
    b.style.transform = `scaleY(${h})`;
  });
}

// ── Scene 6: everyone leaves on time ──

const departCaption = el("h2", "caption-line solo", scenes.depart, "Everyone leaves on time.");
const departSub = el("p", "caption-sub solo", scenes.depart, "A text 15 minutes before each walk, timed so all four arrive together.");
const dSvg = svgEl("svg", { viewBox: "0 0 1920 1080", class: "full" }, scenes.depart);
const T0 = 18 * 60 + 10;
const T1 = 18 * 60 + 45;
const tx = (m: number) => lerp(760, 1640, (m - T0) / (T1 - T0));
const DEPARTS = [
  { name: "Jason", leave: 18 * 60 + 15 },
  { name: "Ana", leave: 18 * 60 + 28 },
  { name: "Maya", leave: 18 * 60 + 34 },
  { name: "Dev", leave: 18 * 60 + 38 },
];
const FINISH: P = [1700, 640];
const dRows = DEPARTS.map((d, i) => {
  const y = 470 + i * 74;
  const pts: P[] = [[tx(d.leave), y], [FINISH[0] - 90 - Math.abs(y - FINISH[1]) * 0.5, y], FINISH];
  const path = svgEl("path", { d: roundedPath(pts, 40), class: "route thin", stroke: COLORS[[0, 3, 1, 2][i]!]! }, dSvg);
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len} ${len}`;
  const dot = svgEl("circle", { cx: tx(d.leave), cy: y, r: 13, class: "origin", stroke: COLORS[[0, 3, 1, 2][i]!]! }, dSvg);
  const label = svgEl("text", { x: tx(d.leave) - 26, y: y + 12, "text-anchor": "end", class: "row-label" }, dSvg);
  label.innerHTML = `<tspan class="row-name">${d.name}</tspan> leaves ${clock(d.leave)}`;
  return { ...d, path, len, dot, label };
});
const dFinish = svgEl("g", { transform: `translate(${FINISH[0]} ${FINISH[1]})` }, dSvg);
svgEl("circle", { r: 34, class: "table-station small" }, dFinish);
const dFinishDot = svgEl("circle", { r: 16, class: "table-dot" }, dFinish);
const dClock = el("div", "mid-clock", scenes.depart);

function renderDepart(t: number) {
  show(departCaption, easeOut(seg(t, 20.3, 21)), 0, 40 * (1 - easeOut(seg(t, 20.3, 21))));
  show(departSub, easeOut(seg(t, 20.6, 21.3)));
  const now = lerp(T0, T1, easeInOut(seg(t, 21, 24)));
  dClock.textContent = `${clock(now)} PM`;
  show(dClock, seg(t, 20.8, 21.2));
  for (const r of dRows) {
    const p = clamp((now - r.leave) / (T1 - r.leave));
    r.path.style.strokeDashoffset = String(r.len * (1 - p));
    const vis = seg(t, 20.9, 21.4);
    r.dot.style.opacity = String(vis);
    r.label.style.opacity = String(vis * (now >= r.leave ? 1 : 0.45));
  }
  dFinishDot.setAttribute("class", now >= T1 - 0.01 ? "table-dot on" : "table-dot");
  dClock.classList.toggle("on", now >= T1 - 0.01);
}

// ── Scene 7: the bill ──

const billCaption = el("h2", "caption-line solo", scenes.bill, "The bill splits itself.");
const billSub = el("p", "caption-sub solo", scenes.bill, "Each person taps 👍 on their own line. Only then does their money move.");
const billTotal = el("div", "bill-total", scenes.bill, `<span>Jason paid</span><b>$52</b>`);
const billRows: CSSStyleDeclaration[] = ["Maya", "Dev", "Ana"].map((n, i) =>
  Object.assign(el("div", "bill-row", scenes.bill, `<i style="background:${COLORS[i + 1]}"></i><span>${n} → Jason</span><b>$13.00</b><em>✓ Sent</em>`).style, {
    top: `${470 + i * 130}px`,
  }),
);

const billEls = [...scenes.bill.querySelectorAll<HTMLElement>(".bill-row")];

function renderBill(t: number) {
  show(billCaption, easeOut(seg(t, 24.8, 25.5)), 0, 40 * (1 - easeOut(seg(t, 24.8, 25.5))));
  show(billSub, easeOut(seg(t, 25.1, 25.8)));
  const tot = easeOut(seg(t, 25.2, 25.9));
  show(billTotal, tot, 0, 30 * (1 - tot));
  billRows.forEach((style, i) => {
    const r = billEls[i]!;
    const x = easeOut(seg(t, 25.8 + i * 0.25, 26.5 + i * 0.25));
    show(r, x, 60 * (1 - x), 0);
    const check = r.querySelector("em") as HTMLElement;
    const c = backOut(seg(t, 26.9 + i * 0.4, 27.3 + i * 0.4));
    check.style.opacity = String(seg(t, 26.9 + i * 0.4, 27.1 + i * 0.4));
    check.style.transform = `scale(${0.6 + 0.4 * c})`;
  });
}

// ── Scene 8: end card ──

const endSvg = svgEl("svg", { viewBox: "0 0 1920 1080", class: "full" }, scenes.end);
const LOGO: P = [960, 430];
const endLines = [
  [[740, 210], LOGO],
  [[1180, 210], LOGO],
  [[740, 650], LOGO],
  [[1180, 650], LOGO],
].map((pts, i) => {
  const path = svgEl("path", { d: roundedPath(pts as P[]), class: "route", stroke: COLORS[i]! }, endSvg);
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len} ${len}`;
  return { path, len };
});
const endDot = svgEl("circle", { cx: LOGO[0], cy: LOGO[1], r: 0, class: "end-dot" }, endSvg);
const endWord = el("div", "end-word", scenes.end, "Rendezvous");
const endUrl = el("div", "end-url", scenes.end, "tablefor.us");
const endNote = el("div", "end-note", scenes.end, "Built at BigRed//Hacks 2026 with Photon, Grok, Capital One Nessie and Google Maps");

function renderEnd(t: number) {
  endLines.forEach((l, i) => {
    const p = easeInOut(seg(t, 28.9 + i * 0.08, 30 + i * 0.08));
    l.path.style.strokeDashoffset = String(l.len * (1 - p));
    // The lines retract into the dot, leaving the mark short and centered.
    const shrink = easeInOut(seg(t, 30.4, 31.2));
    l.path.style.strokeDasharray = `${l.len * (1 - 0.62 * shrink)} ${l.len}`;
    l.path.style.strokeDashoffset = String(l.len * (1 - p) - l.len * 0.62 * shrink);
  });
  endDot.setAttribute("r", String(46 * backOut(seg(t, 30.1, 30.6))));
  const w = easeOut(seg(t, 30.7, 31.5));
  show(endWord, w, 0, 40 * (1 - w));
  show(endUrl, easeOut(seg(t, 31.1, 31.8)));
  show(endNote, easeOut(seg(t, 31.4, 32.1)));
}

// ── wipes: four bars in the friends' colors sweep across between scenes ──

const wipe = el("div", "wipe", stage);
const wipeBars = COLORS.map((c) => {
  const b = el("i", "", wipe);
  b.style.background = c;
  return b;
});
/** Scene cuts. The bars sweep in, cover the frame exactly at the cut, then sweep out. */
const CUTS = [8.0, 20.0, 24.6, 28.6];
function renderWipe(t: number) {
  let active = false;
  for (const w of CUTS) {
    if (t < w - 0.45 || t > w + 0.5) continue;
    active = true;
    wipeBars.forEach((b, i) => {
      const inP = easeInOut(seg(t, w - 0.42 + i * 0.04, w - 0.12 + i * 0.04));
      const outP = easeInOut(seg(t, w + 0.04 + i * 0.05, w + 0.34 + i * 0.05));
      b.style.transform = `translateX(${outP > 0 ? lerp(0, 102, outP) : lerp(-102, 0, inP)}%)`;
    });
  }
  wipe.style.display = active ? "block" : "none";
}

// ── frame ──

const RANGES: Array<[keyof typeof scenes, number, number]> = [
  ["map", 0, 8.0],
  ["phone", 8.0, 20.0],
  ["depart", 20.0, 24.6],
  ["bill", 24.6, 28.6],
  ["end", 28.6, DURATION + 1],
];

function render(t: number) {
  for (const [k, a, b] of RANGES) scenes[k].style.display = t >= a && t < b ? "" : "none";
  if (t < 8) renderMap(t);
  else if (t < 20) renderPhone(t);
  else if (t < 24.6) renderDepart(t);
  else if (t < 28.6) renderBill(t);
  else renderEnd(t);
  renderWipe(t);
}

declare global {
  interface Window {
    __render: (t: number) => void;
    __duration: number;
    __ready: Promise<void>;
  }
}
window.__render = render;
window.__duration = DURATION;
window.__ready = document.fonts.ready.then(() => undefined);

// Opened directly, it plays in real time and loops.
if (!new URLSearchParams(location.search).has("record")) {
  void window.__ready.then(() => {
    const t0 = performance.now();
    const loop = (now: number) => {
      render(((now - t0) / 1000) % (DURATION + 1));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
} else {
  render(0);
}
