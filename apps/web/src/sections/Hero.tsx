import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND } from "../brand";
import { ARRIVE, RIDERS, TABLE, clockText, roundedPath } from "../diagram";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

const RUN_MS = 7600;

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const lines = useMemo(
    () =>
      RIDERS.map((r) => {
        const d = roundedPath(r.points, 34);
        const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("d", d);
        return { ...r, d, el, length: el.getTotalLength(), leave: ARRIVE - r.minutes };
      }),
    [],
  );
  const start = Math.min(...lines.map((l) => l.leave)) - 3;
  const [now, setNow] = useState(reduced ? ARRIVE : start);
  const [run, setRun] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced) {
      setNow(ARRIVE);
      return;
    }
    setNow(start);
    let t0: number | undefined;
    const tick = (t: number) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / RUN_MS);
      // Ease out so the last friends arrive together, slowly.
      setNow(start + (ARRIVE - start) * (1 - (1 - p) ** 2.4));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => (raf.current = requestAnimationFrame(tick)), 600);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(raf.current);
    };
  }, [reduced, run, start]);

  const arrived = now >= ARRIVE - 0.02;

  return (
    <header className="hero" id="top">
      <nav className="nav" aria-label="Main">
        <a href="#top" className="wordmark" aria-label={`${BRAND.name} home`}>
          <Logo />
          <span>{BRAND.name}</span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#try">Try it</a>
          <a href="#privacy">Privacy</a>
        </div>
      </nav>

      <div className="hero-grid">
        <div className="hero-copy" data-trunk-start>
          <h1>
            <span className="line">Four routes,</span>
            <span className="line">
              one table<span className="pin-period" aria-hidden="true" />
              <span className="sr-only">.</span>
            </span>
          </h1>
          <p className="lede">
            {BRAND.name} lives in iMessage. Text it what you want to do and who's coming. It picks the spot that's fairest to everyone's walk,
            calls to book the table, tells each of you when to leave, and splits the bill afterward.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#try">
              Plan a dinner here
            </a>
            <a className="btn btn-quiet" href="#how">
              See how it works
            </a>
          </div>
        </div>

        <figure className="hero-diagram">
          <svg
            viewBox="0 0 760 660"
            role="img"
            aria-label="Four friends leave from North Campus, Olin Library, Duffield Hall and the Commons at different times, and all arrive at Sangam at 7:15 PM."
          >
            <text x="40" y="350" className="d-clock">
              {clockText(now)}
            </text>
            <text x="44" y="392" className={`d-clock-sub ${arrived ? "on" : ""}`}>
              {arrived ? "Everyone's at the table" : "PM, tonight"}
            </text>

            {lines.map((l) => (
              <path key={`g-${l.id}`} d={l.d} className="d-ghost" style={{ stroke: l.color }} />
            ))}
            {lines.map((l) => {
              const p = Math.min(1, Math.max(0, (now - l.leave) / l.minutes));
              const pt = l.el.getPointAtLength(l.length * p);
              const [ox, oy] = l.points[0]!;
              const anchorEnd = ox > 380;
              // Labels sit beside the origin, clear of the line's first run.
              const lx = anchorEnd ? ox - 24 : ox;
              const ly = l.label === "below" ? oy + 42 : oy - 44;
              const state = now < l.leave ? "waiting" : p < 1 ? "walking" : "there";
              return (
                <g key={l.id} className={`d-rider ${state}`} style={{ color: l.color }}>
                  <path d={l.d} className="d-line" style={{ strokeDasharray: `${l.length} ${l.length}`, strokeDashoffset: l.length * (1 - p) }} />
                  <circle cx={ox} cy={oy} r="11" className="d-origin" />
                  <text x={lx} y={ly} textAnchor={anchorEnd ? "end" : "start"} className="d-name">
                    {l.name}
                  </text>
                  <text x={lx} y={ly + 22} textAnchor={anchorEnd ? "end" : "start"} className="d-from">
                    {l.from}, leaves {clockText(l.leave)}
                  </text>
                  {p > 0 && p < 1 && <circle cx={pt.x} cy={pt.y} r="13" className="d-walker" />}
                </g>
              );
            })}

            <g className={`d-table ${arrived ? "arrived" : ""}`} transform={`translate(${TABLE[0]} ${TABLE[1]})`}>
              <circle r="44" className="d-ring" />
              <circle r="30" className="d-station" />
              <circle r="15" className="d-dot" />
            </g>
            <text x={TABLE[0] - 22} y={TABLE[1] - 64} textAnchor="end" className="d-venue">
              Sangam
            </text>
            <text x={TABLE[0] - 22} y={TABLE[1] - 42} textAnchor="end" className="d-venue-sub">
              table for 4, 7:15 PM
            </text>
          </svg>
          {!reduced && arrived && (
            <button className="replay" onClick={() => setRun((r) => r + 1)}>
              Replay
            </button>
          )}
        </figure>
      </div>
    </header>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <g strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M5 5 L12.5 12.5" stroke="var(--l1)" />
        <path d="M27 5 L19.5 12.5" stroke="var(--l2)" />
        <path d="M5 27 L12.5 19.5" stroke="var(--l3)" />
        <path d="M27 27 L19.5 19.5" stroke="var(--l4)" />
      </g>
      <circle cx="16" cy="16" r="4.6" fill="var(--signal)" />
    </svg>
  );
}
