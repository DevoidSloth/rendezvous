import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Records the sample demo video from the live site: the hero, then the full
 * plan loop in the demo, then the closing section, with captions and a
 * narrated voiceover (macOS `say`). Needs Chrome, ffmpeg and the dev server:
 *   npm run dev:web   (in another terminal)
 *   npm run demo:video
 * Output: demo/rendezvous-demo.mp4
 */

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, ".build");
mkdirSync(work, { recursive: true });
const URL_ = process.env.DEMO_URL ?? "http://localhost:5173/";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const VOICE = process.env.DEMO_VOICE ?? "Samantha";

const beats = JSON.parse(readFileSync(join(here, "beats.json"), "utf8"));
for (const b of beats) {
  const file = join(work, `${b.id}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", "185", "-o", file, b.say]);
  b.file = file;
  b.seconds = Number(execFileSync(FFMPEG.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}
const W = 1440, H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [`--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL_, { waitUntil: "networkidle0" }).catch(() => {
  console.error(`Couldn't open ${URL_}. Start the site first: npm run dev:web`);
  process.exit(1);
});
await page.evaluate(() => document.fonts.ready);

// Caption bar drawn on top of the page.
await page.addStyleTag({
  content: `#vcap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;max-width:min(1100px,90vw);
  padding:14px 26px 11px;border-radius:14px;background:rgba(26,46,40,.92);color:#EDF0E6;font:600 23px/1.35 Overpass,sans-serif;
  text-align:center;letter-spacing:-.005em;box-shadow:0 12px 40px -12px rgba(0,0,0,.45);transition:opacity .35s}
  #vcap.hide{opacity:0} html{scroll-behavior:smooth}`,
});
await page.evaluate(() => {
  const d = document.createElement("div");
  d.id = "vcap";
  d.className = "hide";
  document.body.appendChild(d);
});

const caption = (text) =>
  page.evaluate((t) => {
    const d = document.getElementById("vcap");
    d.textContent = t;
    d.className = t ? "" : "hide";
  }, text);

const clickChip = async (label) => {
  for (let i = 0; i < 80; i++) {
    const ok = await page.evaluate((t) => {
      const c = [...document.querySelectorAll(".chip")].find((e) => e.textContent.includes(t));
      if (c) c.click();
      return !!c;
    }, label);
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`chip not found: ${label}`);
};
const waitFor = async (fn, arg, timeout = 30000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (await page.evaluate(fn, arg)) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting: ${fn}`);
};
const hasMsg = (re) => [...document.querySelectorAll("#try .msg")].some((m) => new RegExp(re).test(m.innerText));
const scrollTo = (sel, offset = 0) =>
  page.evaluate(
    (s, o) => window.scrollTo({ top: document.querySelector(s).getBoundingClientRect().top + window.scrollY - o, behavior: "smooth" }),
    sel,
    offset,
  );

const raw = join(work, "raw.webm");
const recorder = await page.screencast({ path: raw, ffmpegPath: FFMPEG, scale: 1 });
const t0 = Date.now();
const starts = {};
let current;
const holdFor = async (id) => {
  const need = (beats.find((b) => b.id === id).seconds + 0.3) * 1000;
  const spent = Date.now() - t0 - starts[id];
  if (spent < need) await sleep(need - spent);
};
const beat = async (id) => {
  // Hold each beat at least as long as its narration.
  if (current) {
    const need = (beats.find((b) => b.id === current).seconds + 0.5) * 1000;
    const spent = Date.now() - t0 - starts[current];
    if (spent < need) await sleep(need - spent);
  }
  current = id;
  starts[id] = Date.now() - t0;
  await caption(beats.find((b) => b.id === id).caption);
};

// 1. Hero: the four routes converge on 7:15.
await sleep(400);
await beat("hero");
await sleep(9600);

// 2. Ask: scroll to the demo and send the request.
await caption("");
await scrollTo(".demo-grid", 24);
await sleep(1400);
await beat("ask");
await sleep(600);
await clickChip("dinner tonight");
await waitFor(hasMsg, "How about this");

// 3. Agree: two 👍, Ana counters, re-plan, everyone else 👍, then Jason.
await sleep(1200);
await beat("agree");
await waitFor(hasMsg, "New plan", 20000);
await waitFor(() => (document.querySelector(".approvals")?.innerText.match(/👍/g) ?? []).length >= 3, null, 20000);
await holdFor("agree");
await clickChip("👍");

// 4. Book: the call, the host's question, Jason answers 1.
await waitFor(() => !!document.querySelector(".view-call .call-head"), null, 15000);
await beat("book");
await waitFor(() => [...document.querySelectorAll(".chip")].some((c) => c.textContent.trim() === "1"), null, 30000);
await sleep(2200);
await clickChip("1");
await waitFor(hasMsg, "Table booked", 30000);

// 5. Go: skip ahead to departure texts.
await sleep(1200);
await beat("go");
await clickChip("Skip ahead");
await waitFor(() => document.querySelectorAll(".dms li.sent").length >= 4, null, 20000);
await sleep(1200);

// 6. Settle: paid, adjust, everyone confirms their own line.
await beat("settle");
await clickChip("I paid $52");
await waitFor(hasMsg, "owes Jason", 15000);
await sleep(1500);
await clickChip("extra drink");
await waitFor(() => [...document.querySelectorAll(".chip")].some((c) => c.textContent.includes("Start over")), null, 30000);
await sleep(1500);

// 7. Close on what it runs on.
await caption("");
await scrollTo("#built", 40);
await sleep(1300);
await beat("close");
await sleep((beats.find((b) => b.id === "close").seconds + 1.2) * 1000);
await caption("");
await sleep(600);

await recorder.stop();
const total = Date.now() - t0;
await browser.close();
if (errors.length) console.warn("page errors:", errors);

// Lay each narration clip at its beat's start and encode the final MP4.
const inputs = ["-i", raw];
const filters = [];
beats.forEach((b, i) => {
  inputs.push("-i", b.file);
  const ms = starts[b.id] + 250;
  filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms},apad[a${i + 1}]`);
});
filters.push(`${beats.map((_, i) => `[a${i + 1}]`).join("")}amix=inputs=${beats.length}:normalize=0:duration=longest,atrim=0:${(total / 1000).toFixed(2)}[aout]`);
const out = join(here, "rendezvous-demo.mp4");
execFileSync(FFMPEG, ["-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out]);
writeFileSync(join(work, "timeline.json"), JSON.stringify({ starts, total }, null, 1));
console.log(`Wrote ${out} (${(total / 1000).toFixed(1)}s)`);
