import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { ITHACA_VENUES, KNOWN_PLACES, estimateWalkMinutes, type LatLng, type Venue } from "@rendezvous/core";
import { BRAND } from "../brand";
import { IthacaMap, type MapRoute } from "../map/IthacaMap";
import { BOUNDS, arcD, project, unproject } from "../map/ithaca";
import { scrollToStep, usePinProgress } from "../usePinProgress";

/**
 * Why this spot: drag the four friends around Ithaca and watch the planner
 * re-pick the table. Uses the agent's own offline walking estimate and the
 * same venue list, so the answer matches what the agent would say.
 */

interface Friend {
  id: string;
  name: string;
  color: string;
  at: LatLng;
}

const place = (label: string) => {
  const p = KNOWN_PLACES.find((k) => k.label === label)!;
  return { lat: p.lat, lng: p.lng };
};

const START: Friend[] = [
  { id: "jason", name: "Jason", color: "var(--l1)", at: place("Robert Purcell Community Center") },
  { id: "maya", name: "Maya", color: "var(--l2)", at: place("Olin Library") },
  { id: "dev", name: "Dev", color: "var(--l3)", at: place("Duffield Hall") },
  { id: "ana", name: "Ana", color: "var(--l4)", at: place("Ithaca Commons") },
];

const inBounds = (v: Venue) =>
  v.location.lat <= BOUNDS.north && v.location.lat >= BOUNDS.south && v.location.lng >= BOUNDS.west && v.location.lng <= BOUNDS.east;
const VENUES = ITHACA_VENUES.filter((v) => v.serves.includes("dinner") && inBounds(v));

type Mode = "fair" | "near";
const BUDGETS: Array<{ label: string; max: number }> = [
  { label: "Any budget", max: Infinity },
  { label: "Under $20", max: 20 },
  { label: "Under $15", max: 15 },
  { label: "Under $12", max: 12 },
];

interface Scored {
  venue: Venue;
  walks: number[];
  longest: number;
  total: number;
}

function score(friends: Friend[], max: number): Scored[] {
  return VENUES.filter((v) => v.typicalSpend <= max).map((venue) => {
    const walks = friends.map((f) => estimateWalkMinutes(f.at, venue.location));
    return { venue, walks, longest: Math.max(...walks), total: walks.reduce((a, b) => a + b, 0) };
  });
}

/** The friend the "usual way" favors: whoever asked, picking somewhere near them. */
const ASKER = 3;

const fairest = (s: Scored[]) => [...s].sort((a, b) => a.longest - b.longest || a.total - b.total)[0];
const nearest = (s: Scored[]) => [...s].sort((a, b) => a.walks[ASKER]! - b.walks[ASKER]! || a.longest - b.longest)[0];

const STEP = 18;
const TOUR = 3;
const STEP_VH = 70;
const PIN_QUERY = "(min-width: 1000px) and (min-height: 780px)";

/** The guided tour pins the map only where the whole stage fits on screen. */
function usePinned(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PIN_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(PIN_QUERY).matches,
    () => false,
  );
}

export function Fairness() {
  const [friends, setFriends] = useState(START);
  const [mode, setMode] = useState<Mode>("fair");
  const [budget, setBudget] = useState(2);
  const [dragging, setDragging] = useState<string>();
  const svg = useRef<SVGGElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pinned = usePinned();
  const progress = usePinProgress(track);
  const step = pinned ? Math.min(TOUR - 1, Math.floor(progress * TOUR)) : TOUR - 1;

  // The first two stops of the tour set the mode; the last hands it to you.
  useEffect(() => {
    if (step === 0) setMode("near");
    if (step === 1) setMode("fair");
  }, [step]);

  const scored = useMemo(() => score(friends, BUDGETS[budget]!.max), [friends, budget]);
  const fair = fairest(scored);
  const near = nearest(scored);
  const pick = mode === "fair" ? fair : near;

  const move = (id: string, at: LatLng) => setFriends((fs) => fs.map((f) => (f.id === id ? { ...f, at } : f)));

  const toMap = (e: PointerEvent) => {
    const g = svg.current;
    const m = g?.ownerSVGElement?.getScreenCTM();
    if (!g || !m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return unproject(pt.x, pt.y);
  };

  const onKey = (f: Friend, e: KeyboardEvent) => {
    const d = { ArrowUp: [0, -STEP], ArrowDown: [0, STEP], ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [x, y] = project(f.at);
    move(f.id, unproject(x + d[0]!, y + d[1]!));
  };

  const routes: MapRoute[] = pick ? friends.map((f) => ({ id: f.id, d: arcD(f.at, pick.venue.location, 0.1), color: f.color, progress: 1 })) : [];
  const scaleMax = Math.max(40, ...(pick?.walks ?? []));
  const longestIdx = pick ? pick.walks.indexOf(pick.longest) : -1;
  const asker = friends[ASKER]!;
  const nameOf = (s: Scored) => friends[s.walks.indexOf(s.longest)]!.name;
  const captions = [
    near && `The usual way: somewhere near whoever asked. ${asker.name} walks ${near.walks[ASKER]} min, and ${nameOf(near)} walks ${near.longest}.`,
    fair && `${BRAND.name} shrinks the longest walk instead. Nobody walks more than ${fair.longest} min.`,
    "Your turn. Drag anyone across town, or change the budget.",
  ];

  return (
    <section className="fair" id="fair" aria-labelledby="fair-title">
      <div className="section-head">
        <span className="station-mark" data-station aria-hidden="true" />
        <h2 id="fair-title">Drag anyone. The table moves.</h2>
        <p>
          Fair means the longest walk in the group is as short as it can be. The planner picks from the same Ithaca restaurants the agent books, and
          re-picks the moment anyone moves.
        </p>
      </div>

      <div className={`fair-track ${pinned ? "pinned" : ""}`} ref={track} style={pinned ? { height: `${TOUR * STEP_VH + 100}vh` } : undefined}>
        {pinned && captions.map((_, i) => <span key={i} className="snap" style={{ top: `${(i + 0.5) * STEP_VH}vh` }} aria-hidden="true" />)}
        <div className="fair-stage">
          <div className="fair-grid">
            <div className={`fair-map ${dragging ? "dragging" : ""}`}>
              <IthacaMap
                title="Map of Ithaca with four friends you can move, and the restaurant the planner picks for them"
                routes={routes}
                destination={pick ? { at: pick.venue.location } : undefined}
              >
                <g ref={svg}>
                  {VENUES.filter((v) => v.id !== pick?.venue.id).map((v) => {
                    const [x, y] = project(v.location);
                    const out = v.typicalSpend > BUDGETS[budget]!.max;
                    return <circle key={v.id} cx={x} cy={y} r="7" className={`fair-venue ${out ? "out" : ""}`} />;
                  })}
                  {pick &&
                    (() => {
                      const [x, y] = project(pick.venue.location);
                      const left = x > 640;
                      return (
                        <text x={left ? x - 46 : x + 46} y={y + 9} textAnchor={left ? "end" : "start"} className="fair-pick-label">
                          {pick.venue.name}
                        </text>
                      );
                    })()}
                  {friends.map((f) => {
                    const [x, y] = project(f.at);
                    return (
                      <g
                        key={f.id}
                        className="fair-pin"
                        transform={`translate(${x} ${y})`}
                        style={{ color: f.color }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${f.name}. Use the arrow keys to move them.`}
                        onKeyDown={(e) => onKey(f, e)}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as Element).setPointerCapture(e.pointerId);
                          setDragging(f.id);
                        }}
                        onPointerMove={(e) => {
                          if (dragging !== f.id) return;
                          const at = toMap(e);
                          if (at) move(f.id, at);
                        }}
                        onPointerUp={() => setDragging(undefined)}
                        onPointerCancel={() => setDragging(undefined)}
                      >
                        <circle r="34" className="fair-pin-hit" />
                        <circle r="16" className="fair-pin-dot" />
                        <text y="-28" textAnchor="middle" className="fair-pin-name">
                          {f.name}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </IthacaMap>
              {friends !== START && (
                <button className="fair-reset" onClick={() => setFriends(START)}>
                  Put everyone back
                </button>
              )}
            </div>

            <div className="fair-panel">
              {pinned && (
                <div className="tour">
                  <ol className="tour-steps" aria-label="Tour">
                    {captions.map((_, i) => (
                      <li key={i}>
                        <button
                          className={i === step ? "on" : i < step ? "done" : ""}
                          aria-current={i === step ? "step" : undefined}
                          aria-label={`Step ${i + 1} of ${TOUR}`}
                          onClick={() => track.current && scrollToStep(track.current, i, TOUR)}
                        />
                      </li>
                    ))}
                  </ol>
                  <p className="tour-caption" key={step} aria-live="polite">
                    {captions[step]}
                  </p>
                </div>
              )}
              <div className="seg" role="radiogroup" aria-label="How to pick">
                {(
                  [
                    ["fair", "Fairest for everyone"],
                    ["near", `Closest to ${asker.name}`],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="budgets" role="radiogroup" aria-label="Budget per person">
                {BUDGETS.map((b, i) => (
                  <button key={b.label} role="radio" aria-checked={budget === i} className={budget === i ? "on" : ""} onClick={() => setBudget(i)}>
                    {b.label}
                  </button>
                ))}
              </div>

              {pick ? (
                <div aria-live="polite">
                  <p className="fair-venue-name">{pick.venue.name}</p>
                  <p className="fair-venue-sub">
                    {pick.venue.cuisine}, {pick.venue.neighborhood}, about ${pick.venue.typicalSpend} each
                  </p>
                  <ul className="walks">
                    {friends.map((f, i) => (
                      <li key={f.id} className={i === longestIdx ? "longest" : ""}>
                        <span className="walk-name">{f.name}</span>
                        <span className="walk-track">
                          <span className="walk-bar" style={{ width: `${(pick.walks[i]! / scaleMax) * 100}%`, background: f.color }} />
                        </span>
                        <span className="walk-min num">{pick.walks[i]} min</span>
                      </li>
                    ))}
                  </ul>
                  <p className="fair-compare">
                    <Compare mode={mode} pick={pick} fair={fair!} near={near!} names={friends.map((f) => f.name)} />
                  </p>
                </div>
              ) : (
                <p className="fair-empty">Nothing on the map fits that budget. Pick a higher one.</p>
              )}

              <p className="fineprint">
                Walks use the agent's offline estimate: straight-line distance stretched by 1.3 for streets and hills, at 75 meters a minute. With
                Google Maps connected it uses real walking routes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Compare({ mode, pick, fair, near, names }: { mode: Mode; pick: Scored; fair: Scored; near: Scored; names: string[] }) {
  const asker = names[ASKER]!;
  if (fair.venue.id === near.venue.id) return <>Here the closest spot for {asker} is also the fairest one. Drag someone farther out of town.</>;
  if (mode === "fair") {
    if (near.longest > fair.longest)
      return (
        <>
          Closest to {asker} would be {near.venue.name}, where someone walks <b className="num">{near.longest} min</b> instead of{" "}
          <b className="num">{fair.longest}</b>.
        </>
      );
    return (
      <>
        {names[fair.walks.indexOf(fair.longest)]} has the longest walk either way, so it breaks the tie on total walking:{" "}
        <b className="num">{fair.total} min</b> for the group instead of <b className="num">{near.total}</b>.
      </>
    );
  }
  const saved = fair.walks[ASKER]! - near.walks[ASKER]!;
  const forAsker = saved > 0 ? `Saves ${asker} ${saved} min` : `${asker} walks just as far`;
  if (near.longest > fair.longest)
    return (
      <>
        {forAsker}, but the longest walk grows from <b className="num">{fair.longest}</b> to <b className="num">{pick.longest} min</b>.
      </>
    );
  return (
    <>
      {forAsker}, and the group walks <b className="num">{near.total} min</b> in all, against <b className="num">{fair.total}</b> at the fair pick.
    </>
  );
}
