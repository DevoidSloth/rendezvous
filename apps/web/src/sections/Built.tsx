import { BRAND } from "../brand";
import { roundedPath, type P } from "../diagram";

const PARTS: Array<{ name: string; job: string }> = [
  { name: "Photon", job: "The whole interface: iMessage threads and group chats, tapback approvals and departure texts." },
  { name: "Grok", job: "Reads what the group asks for, and Grok Voice places the reservation call." },
  { name: "Capital One Nessie", job: "Ithaca restaurants as merchants, budgets from balances, and the transfers that settle the bill." },
  { name: "Google Maps and Calendar", job: "Walking times for every route, and free/busy for every calendar." },
  { name: "Twilio and Pipecat", job: "Bridge the restaurant's phone line to the voice agent." },
  { name: "GoDaddy Registry", job: `${BRAND.domain}, because it's a table for us.` },
];

/** The system as a line map: the agent server is the interchange every line passes through. */
const HUB: P = [520, 200];
const LINES: Array<{ color: string; points: P[] }> = [
  { color: "var(--l1)", points: [[60, 200], HUB] },
  { color: "var(--ink)", points: [HUB, [1040, 200]] },
  { color: "var(--l3)", points: [[520, 200], [520, 130], [590, 60], [730, 60], [800, 130], [800, 200]] },
  { color: "var(--l2)", points: [[500, 200], [500, 270], [440, 330], [320, 330]] },
  { color: "var(--l4)", points: [[540, 200], [540, 270], [600, 330], [720, 330]] },
];
const STOPS: Array<{ at: P; name: string; sub: string; anchor: "start" | "middle" | "end"; dy: number; end?: boolean }> = [
  { at: [60, 200], name: "Your chat", sub: "iMessage", anchor: "start", dy: -30 },
  { at: [270, 200], name: "Photon", sub: "texts and tapbacks", anchor: "middle", dy: -30 },
  { at: [800, 200], name: "Call bridge", sub: "Twilio and Pipecat", anchor: "middle", dy: 52 },
  { at: [1040, 200], name: "Restaurant", sub: "books the table", anchor: "end", dy: -30, end: true },
  { at: [660, 60], name: "Grok", sub: "reads the chat, voices the call", anchor: "middle", dy: -24 },
  { at: [320, 330], name: "Google", sub: "walks and free/busy", anchor: "end", dy: 8 },
  { at: [720, 330], name: "Nessie", sub: "budgets and payments", anchor: "start", dy: 8 },
];

export function Built() {
  return (
    <section className="built" id="built" aria-labelledby="built-title">
      <div className="section-head">
        <span className="station-mark" data-station aria-hidden="true" />
        <h2 id="built-title">What it runs on</h2>
        <p>
          One agent server holds the plan and talks to the group through Photon. A separate Python bridge handles the phone audio. Built in Cursor
          at {BRAND.event}.
        </p>
      </div>
      <figure className="system">
        <svg viewBox="0 -24 1100 424" role="img" aria-label="Your chat connects through Photon to the agent server. The agent server uses Grok, Google and Nessie, and reaches the restaurant through a call bridge.">
          {LINES.map((l, i) => (
            <path key={i} d={roundedPath(l.points, 30)} className="sys-line" style={{ stroke: l.color }} />
          ))}
          {STOPS.map((s) => {
            const sideways = s.dy === 8;
            const tx = sideways ? s.at[0] + (s.anchor === "end" ? -26 : 26) : s.at[0];
            const ty = sideways ? s.at[1] - 4 : s.at[1] + s.dy - (s.dy < 0 ? 18 : 0);
            return (
              <g key={s.name}>
                <circle cx={s.at[0]} cy={s.at[1]} r={s.end ? 16 : 11} className={`sys-stop ${s.end ? "end" : ""}`} />
                {s.end && <circle cx={s.at[0]} cy={s.at[1]} r="7" className="sys-stop-dot" />}
                <text x={tx} y={ty} textAnchor={s.anchor} className="sys-name">
                  {s.name}
                </text>
                <text x={tx} y={ty + 22} textAnchor={s.anchor} className="sys-sub">
                  {s.sub}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${HUB[0]} ${HUB[1]})`}>
            <rect x="-78" y="-30" width="156" height="60" rx="30" className="sys-hub" />
            <text y="8" textAnchor="middle" className="sys-hub-text">
              Agent server
            </text>
          </g>
        </svg>
      </figure>
      <ul className="parts">
        {PARTS.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b>
            <span>{p.job}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
