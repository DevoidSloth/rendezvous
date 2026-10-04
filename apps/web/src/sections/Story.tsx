import { useEffect, useRef, useState } from "react";
import { BRAND } from "../brand";
import { AgentGlyph } from "../demo/Phone";

/**
 * How it works, as six stations. The phone fills in as each station scrolls
 * past. It shows Jason's 1:1 thread with the agent, so friends' messages arrive
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

export function Story() {
  const [active, setActive] = useState(0);
  const steps = useRef<Array<HTMLElement | null>>([]);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const s of steps.current) if (s) io.observe(s);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [active]);

  const shown = STATIONS.slice(0, active + 1).flatMap((s, i) => s.lines.map((l, j) => ({ ...l, key: `${i}-${j}`, fresh: i === active })));
  const banner = STATIONS[active]!.lines.find((l) => l.banner);

  return (
    <section className="story" id="how" aria-labelledby="how-title">
      <div className="story-head">
        <h2 id="how-title">From “dinner?” to “paid back” in one thread</h2>
      </div>
      <div className="story-grid">
        <ol className="stations">
          {STATIONS.map((s, i) => (
            <li
              key={s.name}
              ref={(el) => {
                steps.current[i] = el;
              }}
              data-index={i}
              className={`station ${i === active ? "active" : ""} ${i < active ? "past" : ""}`}
            >
              <span className="station-mark" data-station aria-hidden="true" />
              <div className="station-body">
                <p className="station-name">
                  <span className="station-num">{i + 1}</span>
                  {s.name}
                </p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <p className="station-detail">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="story-phone-wrap">
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
                      {l.tapbacks ? (
                        <span className="tapbacks">
                          👍{l.tapbacks > 1 && <small>{l.tapbacks}</small>}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
