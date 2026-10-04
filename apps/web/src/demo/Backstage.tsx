import { useEffect, useState } from "react";
import { formatMoney, formatTime, priceRange, type Interval, type LatLng } from "@rendezvous/core";
import { BRAND } from "../brand";
import { arcD, project, SIZE } from "../map/ithaca";
import { IthacaMap, type MapRoute } from "../map/IthacaMap";
import { DEMO_MEMBERS, STAGES, memberName, type DemoSnapshot, type Stage } from "./session";

const STAGE_COPY: Record<Stage, { name: string; text: string }> = {
  ask: { name: "Ask", text: `Someone texts ${BRAND.name} what they want to do and who's coming, or mentions it in a group chat.` },
  plan: { name: "Plan", text: "It checks free/busy, budgets and walking times, then picks the spot where the longest walk is shortest." },
  agree: { name: "Agree", text: "Everyone taps 👍 on the plan. A reply with a change starts a new round, and after three rounds the organizer picks." },
  book: { name: "Book", text: "If the place takes reservations, it calls. Anything the host asks that it can't answer goes to the group." },
  go: { name: "Go", text: "Each person gets a DM 15 minutes before they need to leave, with walking directions." },
  settle: { name: "Settle", text: "Whoever paid says so. Each person taps 👍 on their own line, and only then does their money move." },
};

export function Backstage({ snap }: { snap: DemoSnapshot }) {
  const [view, setView] = useState<Stage>(snap.stage);
  // Follow the conversation unless the reader is looking back at an earlier stage.
  useEffect(() => setView(snap.stage), [snap.stage]);
  const reached = STAGES.indexOf(snap.stage);

  return (
    <section className="backstage" aria-label={`What ${BRAND.name} is doing`}>
      <ol className="rail">
        {STAGES.map((s, i) => (
          <li key={s} className={`${i < reached ? "done" : ""} ${i === reached ? "current" : ""} ${s === view ? "viewing" : ""}`}>
            <button onClick={() => setView(s)} disabled={i > reached} aria-current={i === reached ? "step" : undefined}>
              <span className="rail-stop" aria-hidden="true" />
              <span className="rail-name">{STAGE_COPY[s].name}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="stage-copy">{STAGE_COPY[view].text}</p>

      <div className="stage-body" key={view}>
        {(view === "ask" || view === "plan" || view === "agree") && <PlanView snap={snap} />}
        {view === "book" && <CallView snap={snap} />}
        {view === "go" && <GoView snap={snap} />}
        {view === "settle" && <SettleView snap={snap} />}
      </div>
    </section>
  );
}

// ───────────────────────── map helpers ─────────────────────────

function cropFor(points: LatLng[]): [number, number, number, number] {
  const xy = points.map((p) => project(p));
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 70;
  x0 -= pad;
  x1 += pad + 60;
  y0 -= pad;
  y1 += pad;
  // Hold a 4:3 frame so the panel doesn't jump between stages.
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < 4 / 3) {
    const nw = (h * 4) / 3;
    x0 -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = (w * 3) / 4;
    y0 -= (nh - h) / 2;
    h = nh;
  }
  return [Math.max(-40, x0), Math.max(-40, y0), Math.min(w, SIZE.w + 80), Math.min(h, SIZE.h + 80)];
}

function useRoutes(snap: DemoSnapshot) {
  const option = snap.plan?.option;
  const routes: MapRoute[] = DEMO_MEMBERS.map((m) => {
    const at = project(m.location!);
    if (!option) return { id: m.id, d: "", color: m.color, progress: 0, at, label: m.name };
    const d = arcD(m.location!, option.venue.location, 0.12);
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", d);
    const length = el.getTotalLength();
    const dm = snap.dms.find((x) => x.memberId === m.id);
    return { id: m.id, d, color: m.color, progress: 1, length, at, label: m.name, dim: snap.stage === "go" && !dm };
  });
  const points: LatLng[] = DEMO_MEMBERS.map((m) => m.location!);
  if (option) points.push(option.venue.location);
  return { routes, view: cropFor(points) };
}

function busyText(busy: Interval[] | undefined, now: Date): string {
  if (!busy) return "No calendar linked";
  const next = busy.filter((b) => b.end > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (!next) return "Free all evening";
  if (next.start <= now) return `Busy until ${formatTime(next.end)}`;
  return `Free until ${formatTime(next.start)}`;
}

// ───────────────────────── views ─────────────────────────

function PlanView({ snap }: { snap: DemoSnapshot }) {
  const { routes, view } = useRoutes(snap);
  const plan = snap.plan;
  const option = plan?.option;

  return (
    <div className="view-plan">
      <div className="view-map">
        <IthacaMap
          title={option ? `Walking routes from each friend to ${option.venue.name}` : "Where each friend is right now"}
          routes={routes}
          destination={option ? { at: option.venue.location } : undefined}
          view={view}
        />
        {option && (
          <div className="map-tag">
            <b>{option.venue.name}</b>
            <span>
              {formatTime(option.time)}, {priceRange(option.venue.priceLevel)}
            </span>
          </div>
        )}
      </div>

      <table className="who">
        <caption className="sr-only">Each friend's calendar and walk</caption>
        <thead>
          <tr>
            <th scope="col">Friend</th>
            <th scope="col">Calendar (free/busy only)</th>
            <th scope="col">{option ? "Walk" : "Location"}</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_MEMBERS.map((m) => {
            const leg = option?.legs.find((l) => l.memberId === m.id);
            return (
              <tr key={m.id}>
                <th scope="row">
                  <span className="dot" style={{ background: m.color }} aria-hidden="true" />
                  {m.name}
                </th>
                <td className={snap.busy[m.id] ? undefined : "muted"}>{busyText(snap.busy[m.id], snap.now)}</td>
                <td className="num">{leg ? `${leg.minutes} min, leaves ${formatTime(leg.departAt)}` : m.from}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {plan && option ? (
        <div className="considered">
          <p>
            <b>Why here:</b> the longest walk is {option.maxTravel} min, the shortest of any place that fits everyone's time, budget and the ask.
            {plan.round > 1 && ` Round ${plan.round}.`}
          </p>
          {plan.backups.length > 0 && (
            <p className="muted">
              Backups:{" "}
              {plan.backups.map((b, i) => (
                <span key={b.venue.id}>
                  {i > 0 && ", "}
                  {b.venue.name} ({b.maxTravel} min)
                </span>
              ))}
            </p>
          )}
          <p className="approvals">
            <span className="approvals-label">Approved:</span>
            {DEMO_MEMBERS.map((m) => (
              <span key={m.id} className={plan.approvals.includes(m.id) ? "yes" : ""}>
                {plan.approvals.includes(m.id) ? "👍 " : ""}
                {m.name}
              </span>
            ))}
          </p>
        </div>
      ) : (
        <p className="considered muted">Locations only feed the walking math. Nobody else in the plan sees them.</p>
      )}
    </div>
  );
}

function CallView({ snap }: { snap: DemoSnapshot }) {
  const call = snap.call;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!call) {
    return (
      <div className="view-call empty">
        <p>{snap.plan?.option.venue.bookingMethod === "walk-in" ? `${snap.plan.option.venue.name} is walk-in only, so there's no call to make.` : "No call yet."}</p>
      </div>
    );
  }
  const secs = Math.floor((Date.now() - call.startedAt) / 1000);
  const status = {
    ringing: "Ringing…",
    talking: `On the call, ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
    waiting: "Waiting on the group",
    booked: "Booked",
    failed: "Call failed",
  }[call.status];

  return (
    <div className="view-call">
      <div className={`call-head ${call.status}`}>
        <span className="call-pulse" aria-hidden="true" />
        <div>
          <b>{call.venue}</b>
          <span>{status}</span>
        </div>
      </div>
      <ol className="transcript" aria-live="polite">
        {call.lines.map((l, i) => (
          <li key={i} className={l.who}>
            <span className="who-label">{l.who === "host" ? "Host" : BRAND.name}</span>
            <p>{l.text}</p>
          </li>
        ))}
        {call.status === "waiting" && (
          <li className="asking">
            <p>The question went out in the chat. Answer it there with a number.</p>
          </li>
        )}
      </ol>
      <p className="fineprint">Twilio places the call and Grok Voice does the talking. It says it's an AI at the start of every call and never gives out a card number.</p>
    </div>
  );
}

function GoView({ snap }: { snap: DemoSnapshot }) {
  const { routes, view } = useRoutes(snap);
  const option = snap.plan?.option;
  return (
    <div className="view-go">
      <div className="view-map">
        <IthacaMap title="Routes to the table" routes={routes} destination={option ? { at: option.venue.location, arrived: snap.dms.length === DEMO_MEMBERS.length } : undefined} view={view} />
      </div>
      <ul className="dms">
        {DEMO_MEMBERS.map((m) => {
          const leg = option?.legs.find((l) => l.memberId === m.id);
          const dm = snap.dms.find((d) => d.memberId === m.id);
          const sendAt = leg ? new Date(leg.departAt.getTime() - 15 * 60_000) : undefined;
          return (
            <li key={m.id} className={dm ? "sent" : ""}>
              <span className="dot" style={{ background: m.color }} aria-hidden="true" />
              <span className="dm-name">{m.name}</span>
              <span className="dm-text">{dm ? dm.text.split("\n")[0] : sendAt ? `DM goes out at ${formatTime(sendAt)}` : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettleView({ snap }: { snap: DemoSnapshot }) {
  const split = snap.split;
  if (!split) {
    return (
      <div className="view-settle empty">
        <p>After the meal, whoever paid posts the total, like “I paid $52.” {BRAND.name} splits it evenly unless someone says otherwise.</p>
      </div>
    );
  }
  const payer = memberName(split.payerId);
  return (
    <div className="view-settle">
      <p className="ledger-total">
        {payer} paid <b>{formatMoney(split.total)}</b>
      </p>
      <ul className="ledger">
        {split.lines.map((l) => {
          const t = snap.transfers.find((x) => x.from === l.memberId);
          return (
            <li key={l.memberId} className={l.confirmed ? "paid" : ""}>
              <span className="dot" style={{ background: DEMO_MEMBERS.find((m) => m.id === l.memberId)?.color }} aria-hidden="true" />
              <span className="ledger-who">
                {memberName(l.memberId)} → {payer}
              </span>
              <span className="ledger-amt num">{formatMoney(l.amount)}</span>
              <span className="ledger-state">{l.confirmed ? (t ? <>Sent ✓ <code>{t.id.slice(0, 8)}</code></> : "Sent ✓") : "Waiting for their 👍"}</span>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">Transfers run through the Capital One Nessie API. Only the person who owes can confirm their own line, and nobody's balance is ever shown.</p>
    </div>
  );
}
