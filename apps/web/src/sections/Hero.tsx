import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "../brand";
import { HERO_DEST, HERO_WALKERS, pathD, walkMinutes } from "../map/ithaca";
import { IthacaMap, type MapRoute } from "../map/IthacaMap";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

const ARRIVE_MIN = 19 * 60 + 15; // 7:15 PM
const RUN_MS = 9000;

const clock = (minutes: number) => {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
};

interface Measured {
  id: string;
  d: string;
  el: SVGPathElement;
  length: number;
  minutes: number;
  leave: number;
}

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const walkers = useMemo<Measured[]>(
    () =>
      HERO_WALKERS.map((w) => {
        const d = pathD(w.path);
        const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("d", d);
        const minutes = walkMinutes(w.path);
        return { id: w.id, d, el, length: el.getTotalLength(), minutes, leave: ARRIVE_MIN - minutes };
      }),
    [],
  );
  const start = Math.min(...walkers.map((w) => w.leave)) - 3;
  const [now, setNow] = useState(reduced ? ARRIVE_MIN : start);
  const [run, setRun] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced) {
      setNow(ARRIVE_MIN);
      return;
    }
    setNow(start);
    let t0: number | undefined;
    // Ease the clock so the convergence slows as everyone closes in.
    const tick = (t: number) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / RUN_MS);
      const eased = 1 - (1 - p) ** 2.2;
      setNow(start + (ARRIVE_MIN - start) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => (raf.current = requestAnimationFrame(tick)), 700);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(raf.current);
    };
  }, [reduced, run, start]);

  const arrived = now >= ARRIVE_MIN - 0.01;
  const routes: MapRoute[] = walkers.map((w, i) => {
    const p = Math.min(1, Math.max(0, (now - w.leave) / w.minutes));
    const pt = w.el.getPointAtLength(w.length * p);
    return {
      id: w.id,
      d: w.d,
      color: HERO_WALKERS[i]!.color,
      progress: p,
      length: w.length,
      at: p < 1 ? [pt.x, pt.y] : undefined,
      origin: [w.el.getPointAtLength(0).x, w.el.getPointAtLength(0).y],
      label: p === 0 ? HERO_WALKERS[i]!.name : undefined,
    };
  });

  return (
    <header className="hero" id="top">
      <nav className="nav" aria-label="Main">
        <a href="#top" className="wordmark" aria-label={`${BRAND.name} home`}>
          <Logo />
          <span>{BRAND.name}</span>
        </a>
        <div className="nav-links">
          <a href="#try">Try it</a>
          <a href="#privacy">Privacy</a>
          <a href="#built">How it's built</a>
        </div>
      </nav>

      <div className="hero-grid">
        <div className="hero-copy">
          <h1>
            <span className="line">Four routes,</span>
            <span className="line">
              one table
            <span className="pin-period" aria-hidden="true" />
              <span className="sr-only">.</span>
            </span>
          </h1>
          <p className="lede">
            {BRAND.name} lives in iMessage. Text it what you want to do and who's coming, and it picks the spot that's fairest to everyone's walk,
            calls to book the table, texts each of you when to leave, and splits the bill afterward.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#try">
              Plan a dinner here
            </a>
            {BRAND.imessageHandle ? (
              <a className="btn btn-quiet" href={`sms:${BRAND.imessageHandle}`}>
                Text {BRAND.name}
              </a>
            ) : (
              <a className="btn btn-quiet" href="#built">
                See how it works
              </a>
            )}
          </div>
        </div>

        <figure className="hero-map">
          <IthacaMap
            title={`Map of Ithaca: four friends walk from North Campus, Olin Library, Duffield Hall and the Commons to ${HERO_DEST.name}, all arriving at 7:15 PM.`}
            routes={routes}
            destination={{ at: HERO_DEST.at, arrived }}
            view={[175, 60, 750, 820]}
          />
          <div className={`map-clock ${arrived ? "done" : ""}`} aria-hidden="true">
            <span className="map-clock-time">{clock(now)}</span>
            <span className="map-clock-ampm">PM</span>
          </div>
          <figcaption className="legend">
            <ol>
              {walkers.map((w, i) => {
                const hw = HERO_WALKERS[i]!;
                const state = now < w.leave ? "waiting" : now < ARRIVE_MIN - 0.01 ? "walking" : "there";
                return (
                  <li key={w.id} className={state} style={{ color: hw.color }}>
                    <span className="legend-dot" aria-hidden="true" />
                    <span className="legend-name">{hw.name}</span>
                    <span className="legend-from">{hw.from}</span>
                    <span className="legend-leave">
                      leaves <b>{clock(w.leave)}</b>
                    </span>
                    <span className="legend-walk">{w.minutes} min</span>
                  </li>
                );
              })}
            </ol>
            <p className={`legend-arrive ${arrived ? "on" : ""}`}>
              <span>
                Table for 4 at <b>7:15</b>, {HERO_DEST.short}
              </span>
              {!reduced && arrived && (
                <button className="link-btn" onClick={() => setRun((r) => r + 1)}>
                  Replay
                </button>
              )}
            </p>
          </figcaption>
        </figure>
      </div>
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <g strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M5 6 L13 13" stroke="var(--f1)" />
        <path d="M27 6 L19 13" stroke="var(--f2)" />
        <path d="M5 26 L13 19" stroke="var(--f3)" />
        <path d="M27 26 L19 19" stroke="var(--f4)" />
      </g>
      <circle cx="16" cy="16" r="3.8" fill="var(--pin)" />
    </svg>
  );
}
