import {
  ITHACA_VENUES,
  KNOWN_PLACES,
  RendezvousEngine,
  VirtualClock,
  addMinutes,
  estimateWalkMinutes,
  formatTime,
  startOfLocalDay,
  type BookingDetails,
  type Interval,
  type Member,
  type Phase,
  type Plan,
  type Place,
  type Split,
} from "@rendezvous/core";
import { BRAND } from "../brand";

/**
 * The website demo. It runs the real RendezvousEngine from @rendezvous/core
 * with simulated ports: a virtual clock, three scripted friends, a scripted
 * restaurant host and a fake Nessie ledger. You play Jason.
 */

export const YOU = "jason";

const place = (label: string): Place => {
  const p = KNOWN_PLACES.find((k) => k.label === label)!;
  return { label: p.label, lat: p.lat, lng: p.lng };
};

export const DEMO_MEMBERS: Array<Member & { color: string; from: string }> = [
  { id: "jason", name: "Jason", handle: "+16075550101", location: place("Robert Purcell Community Center"), color: "var(--f1)", from: "North Campus", calendarId: "jason" },
  { id: "maya", name: "Maya", handle: "+16075550102", location: place("Olin Library"), color: "var(--f2)", from: "Olin Library", calendarId: "maya" },
  { id: "dev", name: "Dev", handle: "+16075550103", location: place("Duffield Hall"), color: "var(--f3)", from: "Duffield Hall", calendarId: "dev" },
  { id: "ana", name: "Ana", handle: "+16075550104", location: place("Ithaca Commons"), color: "var(--f4)", from: "The Commons" },
];

export const memberColor = (id: string) => DEMO_MEMBERS.find((m) => m.id === id)?.color ?? "var(--ink-soft)";
export const memberName = (id: string) => (id === "agent" ? BRAND.name : DEMO_MEMBERS.find((m) => m.id === id)?.name ?? id);

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  at: Date;
  reactions: Array<{ by: string; emoji: string }>;
}

export interface CallLine {
  who: "host" | "agent";
  text: string;
}

export interface CallState {
  venue: string;
  status: "ringing" | "talking" | "waiting" | "booked" | "failed";
  lines: CallLine[];
  startedAt: number;
}

export interface Dm {
  memberId: string;
  text: string;
  at: Date;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
  id: string;
}

export type Stage = "ask" | "plan" | "agree" | "book" | "go" | "settle";
export const STAGES: Stage[] = ["ask", "plan", "agree", "book", "go", "settle"];

export interface Suggestion {
  label: string;
  send?: string;
  react?: string;
  action?: "skip" | "reset";
  primary?: boolean;
}

export interface DemoSnapshot {
  now: Date;
  phase: Phase;
  stage: Stage;
  messages: ChatMessage[];
  typing: string | null;
  plan?: Plan;
  call: CallState | null;
  dms: Dm[];
  split?: Split;
  transfers: Transfer[];
  banner: { id: number; title: string; text: string } | null;
  suggestions: Suggestion[];
  busy: Record<string, Interval[]>;
  pendingAsk: { options: string[]; messageId: string } | null;
  skipping: boolean;
}

class Cancelled extends Error {}

export class DemoSession {
  private clock!: VirtualClock;
  private engine!: RendezvousEngine;
  private messages: ChatMessage[] = [];
  private typing: string | null = null;
  private call: CallState | null = null;
  private dms: Dm[] = [];
  private transfers: Transfer[] = [];
  private banner: DemoSnapshot["banner"] = null;
  private pendingAsk: DemoSnapshot["pendingAsk"] = null;
  private busy: Record<string, Interval[]> = {};
  private skipping = false;
  private adjusted = false;
  private anaCountered = false;
  private scripted = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ticker?: ReturnType<typeof setInterval>;
  private gen = 0;
  private seq = 0;
  private listeners = new Set<() => void>();
  private snap!: DemoSnapshot;

  constructor() {
    this.reset();
  }

  // ───────────── store plumbing for useSyncExternalStore ─────────────

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private changed() {
    this.snap = this.buildSnapshot();
    for (const fn of this.listeners) fn();
  }

  // ───────────── lifecycle ─────────────

  reset() {
    this.gen++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.ticker) clearInterval(this.ticker);

    const today = startOfLocalDay(new Date());
    const at = (h: number, m: number) => addMinutes(today, h * 60 + m);
    this.clock = new VirtualClock(at(17, 41));
    this.busy = {
      jason: [{ start: at(17, 30), end: at(18, 15) }],
      dev: [{ start: at(16, 0), end: at(18, 30) }],
      maya: [{ start: at(20, 30), end: at(21, 30) }],
    };
    this.messages = [];
    this.typing = null;
    this.call = null;
    this.dms = [];
    this.transfers = [];
    this.banner = null;
    this.pendingAsk = null;
    this.skipping = false;
    this.adjusted = false;
    this.anaCountered = false;
    this.scripted.clear();
    this.queue = Promise.resolve();

    const members = DEMO_MEMBERS.map(({ color: _c, from: _f, ...m }) => ({ ...m, location: m.location && { ...m.location } }));
    const gen = this.gen;
    this.engine = new RendezvousEngine(
      { chatId: "demo", members, organizerId: YOU },
      {
        now: () => this.clock.now(),
        schedule: (when, key, fn) => this.clock.schedule(when, key, fn),
        cancel: (key) => this.clock.cancel(key),
        send: (text) => this.agentSays(text, gen),
        dm: async (member, text) => {
          this.dms.push({ memberId: member.id, text, at: this.clock.now() });
          if (member.id === YOU) this.banner = { id: ++this.seq, title: BRAND.name, text: text.split("\n")[0]! };
          this.changed();
          return true;
        },
        venues: async () => ITHACA_VENUES,
        travel: (from, venue) => estimateWalkMinutes(from, venue.location),
        busy: async () => this.busy,
        balances: async () => ({ jason: 80, maya: 45, dev: 22, ana: 60 }),
        callVenue: async (plan, details) => {
          void this.runCall(plan, details, gen).catch((e) => {
            if (!(e instanceof Cancelled)) throw e;
          });
          return { callSid: "CA-demo" };
        },
        transfer: async (from, to, amount) => {
          const id = Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
          this.transfers.push({ from: from.id, to: to.id, amount, id });
          return { ok: true, id };
        },
      },
      { agentName: BRAND.name, askTimeoutSeconds: 60 },
    );
    this.engine.on((e) => {
      if (e.type === "plan") this.onPlan(e.plan);
      if (e.type === "split") this.onSplit(e.split);
      this.changed();
    });

    this.ticker = undefined;
    this.start();
    this.changed();
  }

  /** Virtual time follows real time so the phone's clock ticks. */
  start() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (this.skipping) return;
      void this.clock.advanceTo(new Date(this.clock.now().getTime() + 1000)).then(() => this.changed());
    }, 1000);
  }

  stop() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = undefined;
  }

  // ───────────── helpers ─────────────

  private sleep(ms: number, gen: number) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (gen !== this.gen) reject(new Cancelled());
        else resolve();
      }, ms);
      this.timers.add(t);
    });
  }

  private later(ms: number, fn: () => void) {
    const gen = this.gen;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (gen === this.gen) fn();
    }, ms);
    this.timers.add(t);
  }

  private enqueue(fn: () => Promise<void>) {
    const gen = this.gen;
    this.queue = this.queue.then(() => (gen === this.gen ? fn() : undefined)).catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
    return this.queue;
  }

  private async agentSays(text: string, gen: number): Promise<string> {
    this.typing = "agent";
    this.changed();
    await this.sleep(Math.min(1100, 380 + text.length * 3), gen);
    const id = `m${++this.seq}`;
    this.messages.push({ id, from: "agent", text, at: this.clock.now(), reactions: [] });
    this.typing = null;
    this.changed();
    return id;
  }

  private post(from: string, text: string) {
    this.messages.push({ id: `m${++this.seq}`, from, text, at: this.clock.now(), reactions: [] });
    this.banner = null;
    this.changed();
  }

  private addReaction(messageId: string, by: string, emoji: string) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    if (msg.reactions.some((r) => r.by === by && r.emoji === emoji)) return false;
    msg.reactions = [...msg.reactions.filter((r) => r.by !== by), { by, emoji }];
    this.changed();
    return true;
  }

  // ───────────── you ─────────────

  say(text: string) {
    const t = text.trim();
    if (!t) return;
    this.post(YOU, t);
    if (/\b(add|extra)\b.*\$\d/i.test(t)) this.adjusted = true;
    void this.enqueue(() => this.engine.onMessage({ id: `in${this.seq}`, senderId: YOU, text: t }));
  }

  react(messageId: string, emoji: string) {
    if (!this.addReaction(messageId, YOU, emoji)) return;
    const kind = emoji === "👍" ? "like" : emoji === "👎" ? "dislike" : emoji === "❤️" ? "love" : emoji === "😂" ? "laugh" : emoji === "‼️" ? "emphasize" : "question";
    void this.enqueue(() => this.engine.onReaction({ messageId, senderId: YOU, kind }));
  }

  /** Jumps the clock to each departure DM in turn. */
  async skipAhead() {
    if (this.skipping) return;
    const gen = this.gen;
    this.skipping = true;
    this.changed();
    try {
      for (;;) {
        const next = this.clock.pending().find((p) => p.key.startsWith("dm:"));
        if (!next) break;
        await this.clock.advanceTo(next.at);
        this.changed();
        await this.sleep(850, gen);
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    } finally {
      if (gen === this.gen) {
        this.skipping = false;
        this.changed();
      }
    }
  }

  dismissBanner() {
    this.banner = null;
    this.changed();
  }

  // ───────────── the friends ─────────────

  private friendSays(id: string, text: string, delay: number) {
    this.later(delay, () => {
      this.typing = id;
      this.changed();
      this.later(900, () => {
        this.typing = null;
        this.post(id, text);
        void this.enqueue(() => this.engine.onMessage({ id: `in${this.seq}`, senderId: id, text }));
      });
    });
  }

  private friendLikes(id: string, messageId: string, delay: number, stillValid: () => boolean) {
    this.later(delay, () => {
      if (!stillValid() || !this.addReaction(messageId, id, "👍")) return;
      void this.enqueue(() => this.engine.onReaction({ messageId, senderId: id, kind: "like" }));
    });
  }

  private onPlan(plan: Plan) {
    const pid = plan.proposalMessageId;
    if (!pid || plan.status !== "proposed" || this.scripted.has(pid)) return;
    this.scripted.add(pid);
    const valid = () => this.engine.plan?.proposalMessageId === pid && this.engine.phase === "proposed";
    if (plan.round === 1 && !this.anaCountered) {
      // The canonical beat: two thumbs up, then Ana pushes back.
      this.anaCountered = true;
      this.friendLikes("maya", pid, 1300, valid);
      this.friendLikes("dev", pid, 2300, valid);
      const indian = plan.option.venue.cuisine.toLowerCase().includes("indian");
      this.later(3000, () => {
        if (valid()) this.friendSays("ana", indian ? "can we push it to 7:30?" : "can we do Indian instead? been craving it all week", 0);
      });
      return;
    }
    this.friendLikes("maya", pid, 1100, valid);
    this.friendLikes("dev", pid, 1800, valid);
    this.friendLikes("ana", pid, 2600, valid);
  }

  private onSplit(split: Split) {
    split.lines.forEach((line, i) => {
      if (line.memberId === YOU || line.confirmed || !line.messageId) return;
      const key = `split:${line.messageId}`;
      if (this.scripted.has(key)) return;
      this.scripted.add(key);
      const mid = line.messageId;
      const valid = () => this.engine.split?.lines.some((l) => l.messageId === mid && !l.confirmed) ?? false;
      // Wait a beat so there's time to adjust the split before anyone pays.
      this.friendLikes(line.memberId, mid, 5200 + i * 1100, valid);
    });
  }

  // ───────────── the venue call ─────────────

  private async runCall(plan: Plan, d: BookingDetails, gen: number) {
    const time = formatTime(d.time);
    const host = (text: string) => this.callLine("host", text);
    const agent = (text: string) => this.callLine("agent", text);
    this.call = { venue: d.venue.name, status: "ringing", lines: [], startedAt: Date.now() };
    this.changed();
    await this.sleep(2000, gen);
    this.call = { ...this.call, status: "talking", startedAt: Date.now() };
    host(`Thanks for calling ${d.venue.name}, how can I help you?`);
    await this.sleep(1700, gen);
    agent(`Hi, I'm an AI assistant calling for ${d.reservationName}. Could I book a table for ${d.partySize} tonight at ${time}?`);
    await this.sleep(2600, gen);
    host(`Let me look. Yes, ${time} works. Would you like a booth or a table by the window?`);
    await this.sleep(1700, gen);
    agent("Let me check with my party. One moment, please.");
    await this.sleep(600, gen);

    this.call = { ...this.call, status: "waiting" };
    const options = ["Booth", "Table by the window"];
    const ask = this.engine.askGroup("Booth or a table by the window?", options);
    // Register the pending question once its message lands in the chat.
    await this.sleep(1200, gen);
    const askMsg = [...this.messages].reverse().find((m) => m.from === "agent" && m.text.startsWith("The host is asking"));
    this.pendingAsk = askMsg ? { options, messageId: askMsg.id } : null;
    this.changed();

    let answered = false;
    void ask.then(() => (answered = true));
    // Fill the silence while the group decides, the way the voice agent does on a real call.
    this.later(6500, () => !answered && this.call?.status === "waiting" && agent("Still checking with my party, thanks for your patience."));
    this.later(11000, () => {
      if (answered || !this.pendingAsk) return;
      this.friendSays("maya", "1", 0);
    });
    const r = await ask;
    if (gen !== this.gen) return;
    this.pendingAsk = null;
    this.call = { ...this.call, status: "talking" };
    const choice = r.answer ?? "Either is fine";
    agent(r.answer ? `${r.answer}, please.` : "Either is fine, thank you.");
    await this.sleep(1600, gen);
    host(`Perfect. ${choice === "Either is fine" ? "A table" : choice} for ${d.partySize} at ${time}, under ${d.reservationName}. See you then.`);
    await this.sleep(1500, gen);
    agent("Thank you. Goodbye!");
    await this.sleep(700, gen);
    this.call = { ...this.call, status: "booked" };
    this.changed();
    void this.enqueue(() => this.engine.onCallResult({ status: "booked", time, notes: r.answer ? `${r.answer} for ${d.partySize}, under ${d.reservationName}` : undefined }));
    void plan;
  }

  private callLine(who: CallLine["who"], text: string) {
    if (!this.call) return;
    this.call = { ...this.call, lines: [...this.call.lines, { who, text }] };
    this.changed();
  }

  // ───────────── derived state ─────────────

  private buildSnapshot(): DemoSnapshot {
    const e = this.engine;
    const phase = e.phase;
    const plan = e.plan;
    const split = e.split;
    let stage: Stage = "ask";
    if (split) stage = "settle";
    else if (phase === "locked") stage = "go";
    else if (phase === "booking") stage = "book";
    else if (phase === "proposed" || phase === "picking") stage = "agree";
    else if (phase === "planning") stage = "plan";
    else if (plan) stage = "agree";

    return {
      now: this.clock.now(),
      phase,
      stage,
      messages: [...this.messages],
      typing: this.typing,
      plan: plan ? { ...plan, approvals: [...plan.approvals] } : undefined,
      call: this.call,
      dms: [...this.dms],
      split: split ? { ...split, lines: split.lines.map((l) => ({ ...l })) } : undefined,
      transfers: [...this.transfers],
      banner: this.banner,
      suggestions: this.suggestions(stage),
      busy: this.busy,
      pendingAsk: this.pendingAsk,
      skipping: this.skipping,
    };
  }

  private suggestions(stage: Stage): Suggestion[] {
    const e = this.engine;
    if (this.typing === "agent" && stage === "ask") return [];
    if (this.pendingAsk) return this.pendingAsk.options.map((o, i) => ({ label: `${i + 1}`, send: `${i + 1}`, primary: i === 0 }));
    switch (stage) {
      case "ask":
        return [
          { label: `@${BRAND.name} dinner tonight, under $15 each`, send: `@${BRAND.name} dinner tonight, under $15 each`, primary: true },
          { label: `@${BRAND.name} lunch tomorrow at noon`, send: `@${BRAND.name} lunch tomorrow at noon` },
        ];
      case "plan":
        return [];
      case "agree": {
        if (e.phase === "picking") {
          return [e.plan!.option, ...e.plan!.backups].map((_, i) => ({ label: `${i + 1}`, send: `${i + 1}` }));
        }
        const pid = e.plan?.proposalMessageId;
        const approved = e.plan?.approvals.includes(YOU);
        const out: Suggestion[] = [];
        if (pid && !approved) out.push({ label: "👍", react: pid, primary: true });
        out.push({ label: "too far, somewhere in Collegetown", send: "too far, somewhere in Collegetown" });
        out.push({ label: "can we do 8 instead", send: "can we do 8 instead" });
        return out;
      }
      case "book":
        return [];
      case "go":
        if (this.skipping) return [];
        return this.dms.length >= DEMO_MEMBERS.length
          ? [{ label: "I paid $52", send: "I paid $52", primary: true }]
          : [{ label: "Skip ahead to when everyone leaves", action: "skip", primary: true }];
      case "settle": {
        const split = e.split!;
        const settled = split.lines.every((l) => l.confirmed);
        if (settled) return [{ label: "Start over", action: "reset", primary: true }];
        if (!this.adjusted && !split.lines.some((l) => l.confirmed)) {
          return [{ label: "Maya had an extra drink, add $5 to hers", send: "Maya had an extra drink, add $5 to hers" }];
        }
        return [];
      }
    }
  }
}
