import { useEffect, useRef } from "react";
import { BRAND } from "../brand";
import { AgentGlyph } from "../demo/Phone";
import { scrollToStep, usePinProgress } from "../usePinProgress";

/**
 * How it works, as six stations on one pinned stage. Scrolling moves the
 * plan along the rail, swaps the copy in place and fills in the phone. It shows Jason's 1:1 thread with the agent, so friends' messages arrive
 * relayed by the agent, as they do on a shared Photon line.
 */

interface Line {
  from: "you" | "agent" | "maya" | "dev" | "ana";
  text: string;
  tapbacks?: number;
  banner?: boolean;
}

const NAMES = { agent: BRAND.name, maya: "Maya", dev: "Dev", ana: "Ana", you: "Jason" } as const;

const STATIONS: Array<{ name: string; title: string; body: string; detail: string; lines: Line[] }> = [
  {
    name: "Ask",
    title: "Say what you want and who's coming",
    body: `Text ${BRAND.name} like you'd text a friend. It saves everyone's numbers, so next time "dinner with the roommates" is enough.`,
    detail: "No app to download. It's just iMessage.",
    lines: [
      { from: "you", text: "dinner tonight, under $15 each, with Maya, Dev and Ana" },
      { from: "agent", text: "On it. Checking calendars, budgets and walks." },
    ],
  },
  {
    name: "Plan",
    title: "It finds the fairest spot",
    body: "It checks when everyone's free, what they can spend, and how far each person walks. Then it picks the place where the longest walk is shortest.",
    detail: "Calendars share free/busy only. Balances and locations stay private.",
    lines: [
      {
        from: "agent",
        text: "How about this: Mama Teresa Pizzeria, tonight at 6:45 PM.\nWalks: Jason 29 min, Maya 11, Dev 5, Ana 19.\nReact 👍 to lock it in, or reply with a change.",
        tapbacks: 2,
      },
    ],
  },
  {
    name: "Agree",
    title: "Everyone taps 👍, or asks for a change",
    body: "A reply like “can we do Indian instead” starts a new round in seconds. After three rounds, the organizer picks.",
    detail: "Quiet friends get ten minutes before it locks in.",
    lines: [
      { from: "ana", text: "can we do Indian instead? been craving it all week" },
      { from: "agent", text: "New plan: Sangam Indian Cuisine, tonight at 6:45 PM.\nWalks: Jason 30 min, Maya 11, Dev 7, Ana 17.", tapbacks: 4 },
    ],
  },
  {
    name: "Book",
    title: "It calls the restaurant",
    body: "Grok Voice calls, says it's an AI, and books the table. When the host asks something only you can answer, the question lands in your chat.",
    detail: "It never gives out a card number.",
    lines: [
      { from: "agent", text: "The host is asking: booth or a table by the window?\n1. Booth\n2. Table by the window" },
      { from: "you", text: "1" },
      { from: "agent", text: "Table booked: Sangam at 6:45 PM. Booth for 4, under Jason." },
    ],
  },
  {
    name: "Go",
    title: "Everyone gets a nudge to leave",
    body: "Each person gets a text 15 minutes before they need to head out, timed to their own walk, with directions that open in Maps.",
    detail: "Different routes, one arrival time.",
    lines: [{ from: "agent", text: "Jason, leave by 6:15 PM for Sangam. The walk is 30 min.", banner: true }],
  },
  {
    name: "Settle",
    title: "The bill splits itself",
    body: "Whoever paid says so. Each person taps 👍 on their own line, and only then does their money move, through Capital One Nessie.",
    detail: "Nobody can pay on someone else's behalf.",
    lines: [
      { from: "you", text: "I paid $52" },
      { from: "agent", text: "Maya owes Jason $13.00. Maya, react 👍 to send it.", tapbacks: 1 },
      { from: "agent", text: "Maya → Jason $13.00 ✓\nDev → Jason $13.00 ✓\nAna → Jason $13.00 ✓" },
    ],
  },
];

const STEP_VH = 80;
const PACE = [0.82, 1, 1.22, 1.5];
const LINE_COLORS = ["var(--l1)", "var(--l2)", "var(--l3)", "var(--l4)"];

export function Story() {
  const track = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const progress = usePinProgress(track);
  const n = STATIONS.length;
  const active = Math.min(n - 1, Math.floor(progress * n));
  // The rail reaches a station when its step is centered on screen.
  const fill = Math.min(1, Math.max(0, (progress * n - 0.5) / (n - 1)));

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [active]);

  const shown = STATIONS.slice(0, active + 1).flatMap((s, i) => s.lines.map((l, j) => ({ ...l, key: `${i}-${j}`, fresh: i === active })));
  const banner = STATIONS[active]!.lines.find((l) => l.banner);

  return (
    <section className="story" id="how" aria-labelledby="how-title">
      <div className="story-track" ref={track} style={{ height: `${n * STEP_VH + 100}vh` }}>
        {STATIONS.map((s, i) => (
          <span key={s.name} className="snap" style={{ top: `${(i + 0.5) * STEP_VH}vh` }} aria-hidden="true" />
        ))}
        <div className="story-stage">
          <div className="story-inner">
            <h2 id="how-title" className="story-title">
              From “dinner?” to “paid back” in one thread
            </h2>

            <div className="story-rail">
              <div className="story-rail-lines" aria-hidden="true">
                {LINE_COLORS.map((c, i) => (
                  <span key={c} style={{ background: c, transform: `scaleX(${fill ** PACE[i]!})` }} />
                ))}
              </div>
              <ol>
                {STATIONS.map((s, i) => (
                  <li
                    key={s.name}
                    className={`${i === active ? "current" : ""} ${i < active ? "done" : ""}`}
                    style={{ left: `${(i / (n - 1)) * 100}%` }}
                  >
                    <button onClick={() => track.current && scrollToStep(track.current, i, n)} aria-current={i === active ? "step" : undefined}>
                      <span className="story-stop" aria-hidden="true" />
                      <span className="story-stop-name">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="story-body">
              <div className="story-copy">
                {STATIONS.map((s, i) => (
                  <div key={s.name} className={`story-step ${i === active ? "on" : i < active ? "before" : "after"}`} aria-hidden={i !== active}>
                    <p className="story-step-num">
                      <span className="num">{i + 1}</span> of {n}
                    </p>
                    <h3>{s.title}</h3>
                    <p className="story-step-text">{s.body}</p>
                    <p className="station-detail">{s.detail}</p>
                  </div>
                ))}
              </div>

              <div className="phone story-phone" aria-hidden="true">
                <div className="phone-status">
                  <span>{["5:41", "5:42", "5:44", "5:48", "6:00", "9:12"][active]}</span>
                  <span className="phone-status-dot" />
                </div>
                {banner && (
                  <div className="phone-banner static" key={`b-${active}`}>
                    <span className="phone-banner-app">{BRAND.name}</span>
                    <span className="phone-banner-text">{banner.text}</span>
                  </div>
                )}
                <header className="phone-head">
                  <div className="phone-avatars">
                    <span className="agent-avatar">
                      <AgentGlyph />
                    </span>
                  </div>
                  <div className="phone-title">{BRAND.name}</div>
                </header>
                <div className="phone-thread" ref={thread}>
                  {shown
                    .filter((l) => !l.banner)
                    .map((l) => (
                      <div key={l.key} className={`msg ${l.from === "you" ? "out" : "in agent"} ${l.fresh ? "fresh" : ""}`}>
                        <div className={`bubble ${l.tapbacks ? "has-reactions" : ""}`}>
                          {l.text.split("\n").map((t, k) => (
                            <span key={k} className="bubble-line">
                              {k === 0 && l.from !== "you" && l.from !== "agent" && <b className={`relay-name who-${l.from}`}>{NAMES[l.from]}: </b>}
                              {t}
                            </span>
                          ))}
                          {l.tapbacks ? <span className="tapbacks">👍{l.tapbacks > 1 && <small>{l.tapbacks}</small>}</span> : null}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
