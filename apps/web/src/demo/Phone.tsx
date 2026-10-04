import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { formatTime } from "@rendezvous/core";
import { BRAND } from "../brand";
import { DEMO_MEMBERS, YOU, memberColor, memberName, type ChatMessage, type DemoSession, type DemoSnapshot, type Suggestion } from "./session";

const TAPBACKS = ["👍", "👎", "❤️", "😂", "‼️", "❓"];
const URL_RE = /(https:\/\/www\.google\.com\/maps\/dir\/\S+)/;

function renderText(text: string): ReactNode {
  return text.split("\n").map((line, i, all) => {
    const parts = line.split(URL_RE);
    return (
      <Fragment key={i}>
        {parts.map((p, j) =>
          URL_RE.test(p) ? (
            <a key={j} href={p} target="_blank" rel="noreferrer" className="maps-link">
              Open walking directions
            </a>
          ) : (
            p
          ),
        )}
        {i < all.length - 1 && <br />}
      </Fragment>
    );
  });
}

export function Phone({ snap, session }: { snap: DemoSnapshot; session: DemoSession }) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, but only scroll the thread, never the page.
  const reactionCount = snap.messages.reduce((n, m) => n + m.reactions.length, 0);
  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    return () => cancelAnimationFrame(raf);
  }, [snap.messages.length, snap.typing, snap.suggestions.length, reactionCount]);

  useEffect(() => {
    if (!snap.banner) return;
    const t = setTimeout(() => session.dismissBanner(), 5200);
    return () => clearTimeout(t);
  }, [snap.banner, session]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    session.say(draft);
    setDraft("");
  };

  const runSuggestion = (s: Suggestion) => {
    if (s.send) session.say(s.send);
    else if (s.react) session.react(s.react, "👍");
    else if (s.action === "skip") void session.skipAhead();
    else if (s.action === "reset") session.reset();
  };

  return (
    <div className="phone" aria-label="Group chat demo">
      <div className="phone-status" aria-hidden="true">
        <span>{formatTime(snap.now).replace(/\s?[AP]M/, "")}</span>
        <span className="phone-status-icons">
          <svg width="17" height="11" viewBox="0 0 17 11">
            <rect x="0" y="7" width="3" height="4" rx="1" />
            <rect x="4.5" y="5" width="3" height="6" rx="1" />
            <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
            <rect x="13.5" y="0" width="3" height="11" rx="1" />
          </svg>
          <svg width="25" height="12" viewBox="0 0 25 12">
            <rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45" />
            <rect x="2" y="2" width="15" height="8" rx="1.8" />
            <rect x="22.5" y="4" width="1.8" height="4" rx=".9" opacity=".45" />
          </svg>
        </span>
      </div>

      {snap.banner && (
        <button className="phone-banner" key={snap.banner.id} onClick={() => session.dismissBanner()}>
          <span className="phone-banner-app">
            <BubbleIcon /> {snap.banner.title}
          </span>
          <span className="phone-banner-text">{snap.banner.text}</span>
        </button>
      )}

      <header className="phone-head">
        <div className="phone-avatars" aria-hidden="true">
          {DEMO_MEMBERS.filter((m) => m.id !== YOU).map((m) => (
            <span key={m.id} style={{ background: m.color }}>
              {m.name[0]}
            </span>
          ))}
          <span className="agent-avatar">
            <AgentGlyph />
          </span>
        </div>
        <div className="phone-title">Dinner crew</div>
        <div className="phone-subtitle">Maya, Dev, Ana and {BRAND.name}</div>
      </header>

      <div className="phone-thread" ref={thread} role="log" aria-live="polite" aria-label="Messages">
        <div className="thread-stamp">
          <b>Today</b> {formatTime(snap.messages[0]?.at ?? snap.now)}
        </div>
        {snap.messages.length === 0 && (
          <p className="thread-empty">
            You're Jason, and Maya, Dev and Ana are in this chat with {BRAND.name}. Mention it below and say what you want to do.
          </p>
        )}
        {snap.messages.map((m, i) => (
          <Bubble
            key={m.id}
            m={m}
            prev={snap.messages[i - 1]}
            pickerOpen={picker === m.id}
            onTogglePicker={() => setPicker((p) => (p === m.id ? null : m.id))}
            onReact={(emoji) => {
              session.react(m.id, emoji);
              setPicker(null);
            }}
          />
        ))}
        {snap.typing && (
          <div className={`msg ${snap.typing === YOU ? "out" : "in"}`}>
            <span className="msg-from">{memberName(snap.typing)}</span>
            <div className="bubble typing" aria-label={`${memberName(snap.typing)} is typing`}>
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      <div className="phone-chips" aria-label="Suggested replies">
        {snap.skipping && <span className="chip-note">Skipping ahead…</span>}
        {snap.suggestions.map((s) => (
          <button key={s.label} className={`chip ${s.primary ? "primary" : ""} ${s.label === "👍" ? "emoji" : ""}`} onClick={() => runSuggestion(s)}>
            {s.label === "👍" ? (
              <>
                <span aria-hidden="true">👍</span>
                <span className="sr-only">React thumbs up to the plan</span>
              </>
            ) : (
              s.label
            )}
          </button>
        ))}
      </div>

      <form className="phone-compose" onSubmit={submit}>
        <label className="sr-only" htmlFor="compose">
          Message the group as Jason
        </label>
        <input id="compose" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="iMessage" autoComplete="off" enterKeyHint="send" />
        <button type="submit" className="send" disabled={!draft.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function Bubble({
  m,
  prev,
  pickerOpen,
  onTogglePicker,
  onReact,
}: {
  m: ChatMessage;
  prev?: ChatMessage;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onReact: (emoji: string) => void;
}) {
  const mine = m.from === YOU;
  const showName = !mine && prev?.from !== m.from;
  const counts = new Map<string, string[]>();
  for (const r of m.reactions) counts.set(r.emoji, [...(counts.get(r.emoji) ?? []), r.by]);
  const reactedByYou = m.reactions.some((r) => r.by === YOU);

  return (
    <div className={`msg ${mine ? "out" : "in"} ${m.from === "agent" ? "agent" : ""} ${showName ? "first" : ""}`}>
      {showName && (
        <span className="msg-from" style={m.from === "agent" ? undefined : { color: memberColor(m.from) }}>
          {memberName(m.from)}
        </span>
      )}
      <div className="bubble-row">
        <div className={`bubble ${m.reactions.length ? "has-reactions" : ""}`}>
          {renderText(m.text)}
          {counts.size > 0 && (
            <span
              className={`tapbacks ${reactedByYou ? "yours" : ""}`}
              aria-label={[...counts].map(([e, by]) => `${e} from ${by.map(memberName).join(", ")}`).join("; ")}
            >
              {[...counts].map(([emoji, by]) => (
                <span key={emoji}>
                  {emoji}
                  {by.length > 1 && <small>{by.length}</small>}
                </span>
              ))}
            </span>
          )}
        </div>
        {!mine && (
          <button className="react-btn" onClick={onTogglePicker} aria-label="React to this message" aria-expanded={pickerOpen}>
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
              <circle cx="9" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="6.6" cy="8.4" r="1" fill="currentColor" />
              <circle cx="11.4" cy="8.4" r="1" fill="currentColor" />
              <path d="M6.2 11.6c1.4 1.8 4.2 1.8 5.6 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {pickerOpen && (
        <div className="tapback-picker" role="group" aria-label="Tapbacks">
          {TAPBACKS.map((e) => (
            <button key={e} onClick={() => onReact(e)} aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="5" fill="#34C759" />
      <path d="M10 4.5c-3.6 0-6.4 2.3-6.4 5.2 0 1.6.9 3 2.3 4l-.5 2.3 2.6-1.4c.6.2 1.3.3 2 .3 3.6 0 6.4-2.3 6.4-5.2S13.6 4.5 10 4.5Z" fill="#fff" />
    </svg>
  );
}

export function AgentGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
      <g strokeWidth="3.2" strokeLinecap="round" fill="none">
        <path d="M7 8 L13 13.5" stroke="var(--f1)" />
        <path d="M25 8 L19 13.5" stroke="var(--f2)" />
        <path d="M7 24 L13 18.5" stroke="var(--f3)" />
        <path d="M25 24 L19 18.5" stroke="var(--f4)" />
      </g>
      <circle cx="16" cy="16" r="3.6" fill="var(--pin)" />
    </svg>
  );
}
