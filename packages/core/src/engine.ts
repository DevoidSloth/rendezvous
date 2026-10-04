import { resolvePlace } from "./geo.ts";
import {
  askGroupMessage,
  callingMessage,
  departureDM,
  lockedMessage,
  noOptionsMessage,
  organizerPicksMessage,
  owesMessage,
  proposalMessage,
  silenceWarning,
  transferDoneMessage,
  transferFailedMessage,
} from "./messages.ts";
import { classifyReply, isMention, parseAdjustment, parseChoice, parseClockTime, parseCounter, parsePayment, parseRequest } from "./parse.ts";
import { planOptions, type TravelFn } from "./planner.ts";
import { computeSplit, formatMoney } from "./split.ts";
import { addMinutes, formatTime, zonedParts } from "./time.ts";
import type { CallRecord, Group, Interval, Member, Plan, PlanConstraints, PlanOption, PlanRequest, Split, Venue } from "./types.ts";

/**
 * The conversation engine for one group chat. It owns the plan, the approval
 * loop, the venue call hand-off, departure DMs and the bill split. Everything
 * that touches the outside world goes through Ports, so the real agent wires
 * in Photon, Grok, Nessie and Google, and the website demo wires in a
 * simulator. Both run this same code.
 */

export interface Ports {
  now(): Date;
  /** Posts to the group chat and returns the message id. */
  send(text: string): Promise<string>;
  /** Sends a 1:1 message. Returns false when a DM thread can't be opened. */
  dm(member: Member, text: string): Promise<boolean>;
  schedule(at: Date, key: string, fn: () => void | Promise<void>): void;
  cancel(key: string): void;
  venues(): Promise<Venue[]>;
  travel: TravelFn;
  /** Free/busy only. Members without a linked calendar are left out of the result. */
  busy(members: Member[], window: Interval): Promise<Record<string, Interval[]>>;
  /** Balances only filter venues; they are never posted. */
  balances(members: Member[]): Promise<Record<string, number | undefined>>;
  /** Starts the venue call. The call reports back via askGroup and onCallResult. */
  callVenue(plan: Plan, details: BookingDetails): Promise<{ callSid?: string }>;
  transfer(from: Member, to: Member, amount: number, description: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** Optional model-backed understanding. Falls back to the built-in parsers when missing or failing. */
  understandRequest?(text: string, members: Member[], now: Date): Promise<PlanRequest | null>;
  understandCounter?(text: string, plan: Plan, now: Date): Promise<CounterChange | null>;
  log?(event: string, data?: unknown): void;
}

export interface BookingDetails {
  venue: Venue;
  time: Date;
  partySize: number;
  reservationName: string;
  callbackNumber: string;
  seating?: string;
  accessibility?: string;
}

export type CounterChange = Partial<PlanConstraints> & { budgetPerPerson?: number; excludeCurrent?: boolean };

export interface EngineOptions {
  agentName: string;
  /** Minutes of quiet after a proposal before the lock warning. */
  nudgeMinutes?: number;
  /** Minutes between the warning and the automatic lock. */
  silenceLockMinutes?: number;
  maxRounds?: number;
  askTimeoutSeconds?: number;
  /** Minutes of slack before each person needs to leave. */
  leadMinutes?: number;
  callbackNumber?: string;
  /** False when no call line is set up; phone-booking venues are then locked without a call. */
  canCall?: () => boolean;
}

export interface IncomingMessage {
  id: string;
  senderId: string;
  text: string;
  /**
   * What a model already decided this message is. Without it the engine
   * falls back to its own parsers ("@Rendezvous …" starts a plan, "yes"
   * approves, "too far" counters).
   */
  kind?: "plan" | "approve" | "counter" | "other";
}

export interface IncomingReaction {
  messageId: string;
  senderId: string;
  /** "like" is a thumbs up tapback. */
  kind: "like" | "dislike" | "love" | "laugh" | "emphasize" | "question";
  removed?: boolean;
}

export type Phase = "idle" | "planning" | "proposed" | "picking" | "booking" | "locked";

interface PendingAsk {
  question: string;
  options: string[];
  binding: boolean;
  messageId: string;
  resolve: (r: AskResult) => void;
}

export interface AskResult {
  answer: string | null;
  answeredBy?: string;
  timedOut: boolean;
}

export type EngineEvent =
  | { type: "phase"; phase: Phase }
  | { type: "plan"; plan: Plan }
  | { type: "split"; split: Split }
  | { type: "call"; call: CallRecord }
  | { type: "dm"; member: Member; text: string; delivered: boolean };

export class RendezvousEngine {
  phase: Phase = "idle";
  plan?: Plan;
  split?: Split;
  call?: CallRecord;
  private pendingAsk?: PendingAsk;
  private askedLocation = new Set<string>();
  private adjustments: Record<string, number> = {};
  private listeners = new Set<(e: EngineEvent) => void>();
  private planSeq = 0;
  private readonly opts: Required<EngineOptions>;

  constructor(
    public group: Group,
    private ports: Ports,
    options: EngineOptions,
  ) {
    this.opts = {
      nudgeMinutes: 5,
      silenceLockMinutes: 10,
      maxRounds: 3,
      askTimeoutSeconds: 60,
      leadMinutes: 15,
      callbackNumber: "",
      canCall: () => true,
      ...options,
    };
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.emit({ type: "phase", phase });
    this.ports.log?.("phase", phase);
  }

  member(id: string): Member | undefined {
    return this.group.members.find((m) => m.id === id);
  }

  /** The question the group is being asked right now, if any (venue call, or the organizer's pick). */
  get openQuestion(): { question: string; options: string[] } | undefined {
    if (this.pendingAsk) return { question: this.pendingAsk.question, options: this.pendingAsk.options };
    if (this.phase === "picking" && this.plan) {
      return {
        question: "Which plan should we go with?",
        options: [this.plan.option, ...this.plan.backups].map((o) => `${o.venue.name} at ${formatTime(o.time)}`),
      };
    }
    return undefined;
  }

  get organizer(): Member {
    return this.member(this.group.organizerId) ?? this.group.members[0]!;
  }

  // ───────────────────────── incoming ─────────────────────────

  async onMessage(msg: IncomingMessage): Promise<void> {
    const sender = this.member(msg.senderId);
    if (!sender) return;
    const text = msg.text.trim();
    if (!text) return;

    this.learnLocation(sender, text);

    if (msg.kind === "plan" || (!msg.kind && isMention(text, this.opts.agentName))) {
      if (this.pendingAsk) return this.answerAsk(sender, text);
      this.group.organizerId = sender.id;
      return this.startPlanning(text);
    }

    if (this.pendingAsk) return this.answerAsk(sender, text);

    const paid = parsePayment(text);
    if (paid !== undefined && (this.phase === "locked" || this.phase === "idle")) {
      return this.startSplit(sender, paid);
    }
    if (this.split && this.split.lines.some((l) => !l.confirmed)) {
      const adj = parseAdjustment(text, this.group.members);
      if (adj) return this.adjustSplit(adj.memberId, adj.amount);
    }

    if (this.phase === "picking" && sender.id === this.group.organizerId && this.plan) {
      const options = [this.plan.option, ...this.plan.backups];
      const n = parseChoice(text, options.length);
      if (n) return this.pick(options[n - 1]!);
      return;
    }

    if (this.phase === "proposed" && this.plan) {
      // A "plan" kind already returned above, so any kind left is a reply kind.
      const kind = msg.kind ?? classifyReply(text);
      if (kind === "approve") return this.approve(sender.id);
      if (kind === "counter") return this.counter(text);
    }
  }

  async onReaction(r: IncomingReaction): Promise<void> {
    const sender = this.member(r.senderId);
    if (!sender) return;

    if (this.pendingAsk && r.messageId === this.pendingAsk.messageId && r.kind === "like" && !r.removed) {
      return this.answerAsk(sender, "yes");
    }

    if (this.phase === "proposed" && this.plan && r.messageId === this.plan.proposalMessageId) {
      if (r.kind === "like") {
        if (r.removed) this.plan.approvals = this.plan.approvals.filter((id) => id !== sender.id);
        else return this.approve(sender.id);
      } else if (r.kind === "dislike" && !r.removed) {
        await this.ports.send(`What would work better, ${sender.name.split(" ")[0]}? Reply with a place, area or time.`);
      }
      return;
    }

    if (this.split && r.kind === "like" && !r.removed) {
      const line = this.split.lines.find((l) => l.messageId === r.messageId);
      // Only the debtor's own thumbs up moves their money.
      if (!line || line.confirmed || line.memberId !== sender.id) return;
      return this.settle(line.memberId);
    }
  }

  // ───────────────────────── planning ─────────────────────────

  private learnLocation(member: Member, text: string) {
    if (!/\b(i'?m|i am|at|from|in|leaving|coming)\b/i.test(text)) return;
    const place = resolvePlace(text);
    if (!place) return;
    member.location = place;
    // A late location fixes that member's departure time.
    if (this.phase === "locked" && this.plan) this.scheduleDeparture(member, this.plan.option);
  }

  async startPlanning(text: string): Promise<void> {
    this.clearTimers();
    this.setPhase("planning");
    const now = this.ports.now();
    let request: PlanRequest | null = null;
    try {
      request = (await this.ports.understandRequest?.(text, this.group.members, now)) ?? null;
    } catch (err) {
      this.ports.log?.("understandRequest failed", String(err));
    }
    request ??= parseRequest(text, now, this.group.members);
    await this.propose(request, 1);
  }

  private async propose(request: PlanRequest, round: number, lead?: string): Promise<void> {
    const now = this.ports.now();
    const members = this.group.members;
    const [venues, busy, balances] = await Promise.all([
      this.ports.venues(),
      this.ports.busy(members, request.window),
      this.ports.balances(members),
    ]);
    const result = await planOptions({ request, members, venues, now, busy, balances, travel: this.ports.travel });
    const [best, ...backups] = result.options;
    if (!best) {
      this.setPhase(this.plan ? "proposed" : "idle");
      await this.ports.send(noOptionsMessage(result.dropped));
      return;
    }
    this.plan = {
      id: `plan-${++this.planSeq}`,
      chatId: this.group.chatId,
      request,
      option: best,
      backups,
      status: "proposed",
      round,
      approvals: [],
      createdAt: now,
    };
    const body = proposalMessage(best, members, { round, now, unlocated: result.unlocated });
    this.plan.proposalMessageId = await this.ports.send(lead ? `${lead}\n\n${body}` : body);
    this.setPhase("proposed");
    this.emit({ type: "plan", plan: this.plan });
    this.scheduleNudge();
  }

  private scheduleNudge() {
    const now = this.ports.now();
    this.ports.cancel("lock");
    this.ports.schedule(addMinutes(now, this.opts.nudgeMinutes), "nudge", async () => {
      if (this.phase !== "proposed") return;
      await this.ports.send(silenceWarning(this.opts.silenceLockMinutes));
      this.ports.schedule(addMinutes(this.ports.now(), this.opts.silenceLockMinutes), "lock", async () => {
        if (this.phase === "proposed") await this.approved();
      });
    });
  }

  private async approve(memberId: string) {
    const plan = this.plan!;
    if (!plan.approvals.includes(memberId)) plan.approvals.push(memberId);
    this.emit({ type: "plan", plan });
    if (this.group.members.every((m) => plan.approvals.includes(m.id))) await this.approved();
  }

  private async counter(text: string) {
    const plan = this.plan!;
    if (plan.round >= this.opts.maxRounds) {
      this.clearTimers();
      this.setPhase("picking");
      await this.ports.send(organizerPicksMessage(this.organizer, [plan.option, ...plan.backups]));
      return;
    }
    const now = this.ports.now();
    let change: CounterChange | null = null;
    try {
      change = (await this.ports.understandCounter?.(text, plan, now)) ?? null;
    } catch (err) {
      this.ports.log?.("understandCounter failed", String(err));
    }
    change ??= parseCounter(
      text,
      { venueId: plan.option.venue.id, maxTravel: plan.option.maxTravel, activity: plan.request.activity, time: plan.option.time, budget: plan.request.budgetPerPerson },
      now,
    );
    const { budgetPerPerson, excludeCurrent, ...constraints } = change;
    const next: PlanRequest = {
      ...plan.request,
      budgetPerPerson: budgetPerPerson ?? plan.request.budgetPerPerson,
      constraints: {
        ...plan.request.constraints,
        ...constraints,
        excludeVenueIds: excludeCurrent
          ? [...new Set([...plan.request.constraints.excludeVenueIds, plan.option.venue.id])]
          : plan.request.constraints.excludeVenueIds,
      },
    };
    if (constraints.preferredTime && constraints.preferredTime > next.window.end) {
      next.window = { ...next.window, end: constraints.preferredTime };
    }
    this.clearTimers();
    await this.propose(next, plan.round + 1);
  }

  private async pick(option: PlanOption) {
    const plan = this.plan!;
    plan.backups = [plan.option, ...plan.backups].filter((o) => o !== option);
    plan.option = option;
    await this.approved();
  }

  private async approved() {
    const plan = this.plan!;
    this.clearTimers();
    plan.status = "approved";
    this.emit({ type: "plan", plan });
    if (plan.option.venue.bookingMethod === "phone") {
      if (this.opts.canCall()) return this.book();
      const v = plan.option.venue;
      return this.lock(false, `${v.name} takes reservations, but I can't call right now${v.phone ? `. Call them at ${v.phone}, or walk in` : ", so plan to walk in"}.`);
    }
    return this.lock(false);
  }

  private async book() {
    const plan = this.plan!;
    plan.status = "booking";
    this.setPhase("booking");
    this.call = { planId: plan.id, status: "dialing", questions: [] };
    this.emit({ type: "call", call: this.call });
    await this.ports.send(callingMessage(plan.option.venue));
    try {
      const { callSid } = await this.ports.callVenue(plan, {
        venue: plan.option.venue,
        time: plan.option.time,
        partySize: plan.request.partySize,
        reservationName: this.organizer.name.split(" ")[0]!,
        callbackNumber: this.opts.callbackNumber || this.organizer.handle,
        seating: plan.request.constraints.seating,
        accessibility: plan.request.constraints.accessibility,
      });
      this.call.callSid = callSid;
      this.call.status = "in-progress";
      this.emit({ type: "call", call: this.call });
    } catch (err) {
      this.ports.log?.("callVenue failed", String(err));
      await this.onCallResult({ status: "failed", notes: "the call didn't connect" });
    }
  }

  /** The venue call's ask_group tool lands here. */
  async askGroup(question: string, options: string[] = [], binding = false): Promise<AskResult> {
    if (this.pendingAsk) this.pendingAsk.resolve({ answer: null, timedOut: true });
    const text = binding
      ? `${askGroupMessage(question, options)}\n${this.organizer.name.split(" ")[0]}, this one's your call.`
      : askGroupMessage(question, options);
    this.call?.questions.push({ question, options });
    if (this.call) this.emit({ type: "call", call: this.call });
    // Register before posting so a fast reply can't slip past the question.
    const result = new Promise<AskResult>((resolve) => {
      const done = (r: AskResult) => {
        this.ports.cancel("ask");
        if (this.pendingAsk?.resolve === done) this.pendingAsk = undefined;
        const q = this.call?.questions.at(-1);
        if (q && r.answer) {
          q.answer = r.answer;
          q.answeredBy = r.answeredBy;
        }
        if (this.call) this.emit({ type: "call", call: this.call });
        resolve(r);
      };
      this.pendingAsk = { question, options, binding, messageId: "", resolve: done };
      this.ports.schedule(addMinutes(this.ports.now(), this.opts.askTimeoutSeconds / 60), "ask", () => {
        done({ answer: null, timedOut: true });
      });
    });
    const pending = this.pendingAsk!;
    pending.messageId = await this.ports.send(text);
    return result;
  }

  private async answerAsk(sender: Member, text: string) {
    const ask = this.pendingAsk!;
    if (ask.binding && sender.id !== this.group.organizerId) return;
    let answer: string | undefined;
    if (ask.options.length) {
      const n = parseChoice(text, ask.options.length);
      if (n) answer = ask.options[n - 1];
      else {
        const t = text.toLowerCase();
        answer = ask.options.find((o) => t.includes(o.toLowerCase()));
      }
    } else if (classifyReply(text) === "approve") answer = "yes";
    else if (/^\s*(no|nope|nah|don'?t|do not)\b/i.test(text)) answer = "no";
    else answer = text;
    if (!answer) return;
    ask.resolve({ answer, answeredBy: sender.name, timedOut: false });
  }

  /** The venue call's report_result tool lands here. */
  async onCallResult(result: { status: "booked" | "unavailable" | "failed" | "no-answer"; time?: string; notes?: string }) {
    const plan = this.plan;
    if (!plan || this.phase !== "booking") return;
    if (this.pendingAsk) this.pendingAsk.resolve({ answer: null, timedOut: true });
    if (this.call) {
      this.call.status = result.status;
      this.call.result = result;
      this.emit({ type: "call", call: this.call });
    }
    if (result.status === "booked") {
      this.applyBookedTime(plan, result.time);
      return this.lock(true, result.notes);
    }

    const venue = plan.option.venue;
    const why =
      result.status === "unavailable"
        ? `${venue.name} has no table then.`
        : `I couldn't reach ${venue.name}${result.status === "no-answer" ? ", nobody picked up" : ""}.`;
    const [next, ...rest] = plan.backups;
    if (!next) {
      this.setPhase("idle");
      await this.ports.send(`${why} I'm out of backups, so mention me again with a different time or area.`);
      return;
    }
    this.plan = { ...plan, id: `plan-${++this.planSeq}`, option: next, backups: rest, approvals: [], status: "proposed", round: plan.round };
    const body = proposalMessage(next, this.group.members, { round: 2, now: this.ports.now() });
    this.plan.proposalMessageId = await this.ports.send(`${why} Here's the backup.\n\n${body}`);
    this.setPhase("proposed");
    this.emit({ type: "plan", plan: this.plan });
    this.scheduleNudge();
  }

  /** The host may book a different time than proposed ("we can do 7:30"). The plan follows the booking. */
  private applyBookedTime(plan: Plan, time?: string) {
    if (!time) return;
    const now = this.ports.now();
    const p = zonedParts(plan.option.time);
    const n = zonedParts(now);
    const dayOffset = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86_400_000);
    const booked = parseClockTime(`at ${time}`, plan.request.activity, now, dayOffset);
    if (!booked || booked.getTime() === plan.option.time.getTime()) return;
    plan.option = {
      ...plan.option,
      time: booked,
      legs: plan.option.legs.map((l) => ({ ...l, departAt: addMinutes(booked, -l.minutes) })),
    };
  }

  private async lock(booked: boolean, notes?: string) {
    const plan = this.plan!;
    plan.status = "locked";
    this.setPhase("locked");
    this.emit({ type: "plan", plan });
    await this.ports.send(lockedMessage(plan.option, booked) + (notes ? `\nNote from the call: ${notes}` : ""));
    for (const m of this.group.members) {
      if (m.location) this.scheduleDeparture(m, plan.option);
      else if (!this.askedLocation.has(m.id)) {
        this.askedLocation.add(m.id);
        await this.ports.send(`${m.name.split(" ")[0]}, where will you be coming from? I'll time your walk.`);
      }
    }
  }

  private scheduleDeparture(member: Member, option: PlanOption) {
    void (async () => {
      const minutes = member.location ? await this.ports.travel(member.location, option.venue) : option.legs.find((l) => l.memberId === member.id)?.minutes ?? 15;
      const leg = option.legs.find((l) => l.memberId === member.id);
      if (leg) {
        leg.minutes = minutes;
        leg.departAt = addMinutes(option.time, -minutes);
      }
      const at = addMinutes(option.time, -(minutes + this.opts.leadMinutes));
      const sendAt = at < this.ports.now() ? this.ports.now() : at;
      this.ports.schedule(sendAt, `dm:${member.id}`, () => this.sendDeparture(member, option, minutes));
    })();
  }

  private async sendDeparture(member: Member, option: PlanOption, minutes: number) {
    const text = departureDM(member, option, minutes);
    let delivered = false;
    try {
      delivered = await this.ports.dm(member, text);
    } catch (err) {
      this.ports.log?.("dm failed", String(err));
    }
    // No 1:1 thread: mention them in the group instead.
    if (!delivered) await this.ports.send(`@${member.name.split(" ")[0]} ${text}`);
    this.emit({ type: "dm", member, text, delivered });
  }

  /** Demo trigger: sends every pending departure DM now. */
  async fastForwardDepartures() {
    const plan = this.plan;
    if (!plan || this.phase !== "locked") return;
    for (const m of this.group.members) {
      this.ports.cancel(`dm:${m.id}`);
      const minutes = plan.option.legs.find((l) => l.memberId === m.id)?.minutes ?? 15;
      await this.sendDeparture(m, plan.option, minutes);
    }
  }

  // ───────────────────────── split ─────────────────────────

  private async startSplit(payer: Member, total: number) {
    this.adjustments = {};
    this.split = { ...computeSplit(this.group.chatId, payer.id, total, this.group.members), planId: this.plan?.id };
    await this.ports.send(`Splitting ${formatMoney(total)} ${this.group.members.length} ways.`);
    await this.postSplitLines();
  }

  private async adjustSplit(memberId: string, amount: number) {
    const split = this.split!;
    if (split.lines.some((l) => l.confirmed)) {
      await this.ports.send("Someone already paid their share, so I can't change the split now.");
      return;
    }
    this.adjustments[memberId] = (this.adjustments[memberId] ?? 0) + amount;
    try {
      this.split = { ...computeSplit(split.chatId, split.payerId, split.total, this.group.members, this.adjustments), planId: split.planId };
    } catch {
      await this.ports.send("That adjustment is more than the bill.");
      return;
    }
    const who = this.member(memberId)!.name.split(" ")[0];
    await this.ports.send(`Got it, ${amount >= 0 ? "added" : "took"} ${formatMoney(Math.abs(amount))} ${amount >= 0 ? "to" : "off"} ${who}'s share. Updated:`);
    await this.postSplitLines();
  }

  private async postSplitLines() {
    const split = this.split!;
    const payer = this.member(split.payerId)!;
    for (const line of split.lines) {
      line.messageId = await this.ports.send(owesMessage(this.member(line.memberId)!, payer, line.amount));
    }
    this.emit({ type: "split", split });
  }

  private async settle(debtorId: string) {
    const split = this.split!;
    const line = split.lines.find((l) => l.memberId === debtorId)!;
    const debtor = this.member(debtorId)!;
    const payer = this.member(split.payerId)!;
    line.confirmed = true;
    const venue = this.plan?.option.venue.name;
    const res = await this.ports.transfer(debtor, payer, line.amount, venue ? `Rendezvous: ${venue}` : "Rendezvous split");
    if (res.ok) {
      line.transferId = res.id;
      await this.ports.send(transferDoneMessage(debtor, payer, line.amount));
    } else {
      line.failed = res.error;
      await this.ports.send(transferFailedMessage(debtor, payer, line.amount));
    }
    this.emit({ type: "split", split });
  }

  // ───────────────────────── misc ─────────────────────────

  private clearTimers() {
    this.ports.cancel("nudge");
    this.ports.cancel("lock");
  }

  describe(): string {
    if (!this.plan) return this.phase;
    return `${this.phase}: ${this.plan.option.venue.name} at ${formatTime(this.plan.option.time)} (round ${this.plan.round})`;
  }
}
