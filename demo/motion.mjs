import puppeteer from "puppeteer-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Renders the Rendezvous motion piece (apps/web/motion.html) frame by frame
 * at 1920×1080, 30 fps, with a synthesized soundtrack timed to its beats.
 *   npm run dev:web        (in another terminal)
 *   npm run demo:motion
 * Output: demo/rendezvous-motion.mp4
 */

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, ".build");
mkdirSync(work, { recursive: true });
const URL_ = process.env.MOTION_URL ?? "http://localhost:5173/motion.html?record";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FPS = 30;

// ───────────────────────── soundtrack ─────────────────────────

const RATE = 48000;
function soundtrack(duration) {
  const n = Math.ceil(duration * RATE);
  const out = new Float32Array(n);
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  // Chords follow the scenes: arrive, the chat, departures, the bill, the end card.
  const CHORDS = [
    [0, [62, 66, 69, 74, 76]], // D add9
    [8, [59, 62, 66, 71, 74]], // Bm
    [20, [55, 59, 62, 67, 69]], // G add9
    [24.6, [57, 61, 64, 69, 71]], // A
    [28.6, [62, 66, 69, 74, 78]], // D
  ];
  const chordAt = (t) => CHORDS.filter(([at]) => t >= at).at(-1)[1];
  const add = (start, len, fn) => {
    const s0 = Math.floor(start * RATE);
    for (let i = 0; i < len * RATE && s0 + i < n; i++) out[s0 + i] += fn(i / RATE);
  };
  // Soft pad under everything.
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const chord = chordAt(t);
    let v = 0;
    for (const m of chord.slice(0, 3)) v += Math.sin(2 * Math.PI * hz(m - 12) * t);
    out[i] += v * 0.018 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  // Marimba-like arpeggio on eighth notes at 120 bpm.
  const pluck = (f, amp) => (t) => amp * Math.exp(-t * 7) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 20));
  const PATTERN = [0, 2, 1, 3, 2, 4, 3, 1];
  for (let k = 0; k * 0.25 < duration - 1.2; k++) {
    const t = k * 0.25;
    const chord = chordAt(t);
    const accent = k % 8 === 0 ? 1.4 : 1;
    add(t, 1.2, pluck(hz(chord[PATTERN[k % 8]]), 0.05 * accent));
  }
  // Accents on the moments that land.
  const ding = (at, midi, amp = 0.16) => add(at, 2, pluck(hz(midi), amp));
  ding(4.4, 86);
  ding(4.4, 81, 0.1);
  [13.4, 13.8, 14.2, 14.6].forEach((at, i) => ding(at, 81 + [0, 2, 4, 7][i], 0.1));
  ding(17.6, 83, 0.1);
  ding(18.5, 86, 0.13);
  ding(24.0, 88);
  [26.9, 27.3, 27.7].forEach((at, i) => ding(at, 81 + [0, 4, 7][i], 0.11));
  ding(30.1, 86, 0.18);
  ding(30.1, 74, 0.12);
  // Whooshes for the wipes.
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const at of [7.6, 19.6, 24.2, 28.2]) {
    let lp = 0;
    add(at, 0.9, (t) => {
      lp += (noise() - lp) * (0.04 + 0.2 * Math.sin((Math.PI * t) / 0.9));
      return lp * 0.5 * Math.sin((Math.PI * t) / 0.9) ** 2;
    });
  }
  // Fade out and soft-limit.
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const fade = Math.min(1, (duration - t) / 1.8, t / 0.2);
    out[i] = Math.tanh(out[i] * 1.6) * 0.8 * Math.max(0, fade);
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), 44 + i * 2);
  return buf;
}

// ───────────────────────── frames ─────────────────────────

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(URL_, { waitUntil: "networkidle0" }).catch(() => {
  console.error(`Couldn't open ${URL_}. Start the site first: npm run dev:web`);
  process.exit(1);
});
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.__duration);

const wav = join(work, "motion.wav");
writeFileSync(wav, soundtrack(duration));

const out = join(here, "rendezvous-motion.mp4");
const ff = spawn(FFMPEG, [
  "-y", "-v", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-i", wav,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.round(duration * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.__render(t), f / FPS);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`Wrote ${out}`);
execFileSync(FFMPEG.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-show_entries", "format=duration,size", "-of", "compact", out], { stdio: "inherit" });
