import { beforeEach, describe, expect, it } from "vitest";
import {
  ITHACA_VENUES,
  RendezvousEngine,
  VirtualClock,
  estimateWalkMinutes,
  resolvePlace,
  zonedDate,
  type Group,
  type Ports,
} from "../src/index.ts";

interface Sent { id: string; text: string }

function setup(opts: { balances?: Record<string, number>; transferFails?: boolean; dmFails?: string[] } = {}) {
  const clock = new VirtualClock(zonedDate(2026, 10, 3, 17, 30));
  const sent: Sent[] = [];
  const dms: Array<{ to: string; text: string }> = [];
  const transfers: Array<{ from: string; to: string; amount: number }> = [];
  const calls: string[] = [];
  const group: Group = {
    chatId: "chat-1",
    organizerId: "jason",
    members: [
      { id: "jason", name: "Jason", handle: "+15550000001", location: resolvePlace("I'm on north campus") },
      { id: "maya", name: "Maya", handle: "+15550000002", location: resolvePlace("collegetown") },
      { id: "dev", name: "Dev", handle: "+15550000003", location: resolvePlace("duffield") },
      { id: "ana", name: "Ana", handle: "+15550000004", location: resolvePlace("west campus") },
    ],
  };
  let seq = 0;
  const ports: Ports = {
    now: () => clock.now(),
    schedule: (at, key, fn) => clock.schedule(at, key, fn),
    cancel: (key) => clock.cancel(key),
    send: async (text) => {
      const id = `m${++seq}`;
      sent.push({ id, text });
      return id;
    },
    dm: async (m, text) => {
      if (opts.dmFails?.includes(m.id)) return false;
      dms.push({ to: m.id, text });
      return true;
    },
    venues: async () => ITHACA_VENUES,
    travel: (from, v) => estimateWalkMinutes(from, v.location),
    busy: async () => ({}),
    balances: async () => opts.balances ?? {},
    callVenue: async (plan) => {
      calls.push(plan.option.venue.id);
      return { callSid: "CA123" };
    },
    transfer: async (from, to, amount) => {
      if (opts.transferFails) return { ok: false, error: "insufficient funds" };
      transfers.push({ from: from.id, to: to.id, amount });
      return { ok: true, id: `t${transfers.length}` };
    },
  };
  const engine = new RendezvousEngine(group, ports, { agentName: "Rendezvous" });
  const last = () => sent.at(-1)!;
  const say = (senderId: string, text: string) => engine.onMessage({ id: `in${++seq}`, senderId, text });
  const like = (senderId: string, messageId: string) => engine.onReaction({ senderId, messageId, kind: "like" });
  const everyoneLikes = async (messageId: string) => {
    for (const m of group.members) await like(m.id, messageId);
  };
  return { clock, sent, dms, transfers, calls, engine, group, last, say, like, everyoneLikes };
}

describe("engine", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("proposes with everyone's walk, then re-plans on a counter", async () => {
    await t.say("jason", "@Rendezvous dinner tonight, under $15 each");
    expect(t.engine.phase).toBe("proposed");
    const proposal = t.last().text;
    expect(proposal).toMatch(/^How about this: /);
    for (const n of ["Jason", "Maya", "Dev", "Ana"]) expect(proposal).toMatch(new RegExp(`${n} \\d+ min`));
    expect(proposal).not.toMatch(/Duffield|North|balance/i); // locations and balances stay private

    const first = t.engine.plan!.option.venue.id;
    await t.like("maya", t.engine.plan!.proposalMessageId!);
    await t.say("dev", "too far, somewhere in the Commons");
    expect(t.engine.plan!.round).toBe(2);
    expect(t.engine.plan!.option.venue.neighborhood).toBe("The Commons");
    expect(t.engine.plan!.option.venue.id).not.toBe(first);
    expect(t.engine.plan!.approvals).toEqual([]);
    expect(t.last().text).toMatch(/^New plan:/);
  });

  it("runs the full loop: approve, call with a question, lock, DMs, split", async () => {
    await t.say("jason", "@Rendezvous dinner tonight, under $15 each");
    // Force a phone-booking venue so the call path runs.
    await t.say("ana", "can we do Indian instead");
    expect(t.engine.plan!.option.venue.bookingMethod).toBe("phone");
    await t.everyoneLikes(t.engine.plan!.proposalMessageId!);
    expect(t.engine.phase).toBe("booking");
    expect(t.calls).toHaveLength(1);

    await new Promise((r) => setTimeout(r));
    const ask = t.engine.askGroup("We have a booth or a table by the window. Which one?", ["Booth", "Window table"]);
    expect(t.last().text).toContain("1. Booth");
    await t.say("maya", "1");
    await expect(ask).resolves.toEqual({ answer: "Booth", answeredBy: "Maya", timedOut: false });

    await t.engine.onCallResult({ status: "booked", time: "7:30 PM" });
    expect(t.engine.phase).toBe("locked");
    // The host's time wins over the proposed one.
    expect(t.last().text).toMatch(/at 7:30 PM\./);
    expect(t.last().text).toMatch(/I'll text each of you/);

    const plan = t.engine.plan!.option;
    await t.clock.advanceTo(plan.time);
    expect(t.dms.map((d) => d.to).sort()).toEqual(["ana", "dev", "jason", "maya"]);
    expect(t.dms[0]!.text).toContain("https://www.google.com/maps/dir/?api=1&destination=");

    await t.say("jason", "I paid $52");
    const lines = t.sent.filter((s) => /owes Jason/.test(s.text));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.text).toBe("Maya owes Jason $13.00. Maya, react 👍 to send it.");

    // Someone else's thumbs up doesn't move Maya's money.
    await t.like("dev", lines[0]!.id);
    expect(t.transfers).toHaveLength(0);
    await t.like("maya", lines[0]!.id);
    expect(t.transfers).toEqual([{ from: "maya", to: "jason", amount: 13 }]);
    expect(t.last().text).toBe("Maya → Jason $13.00 ✓");
    // A second tap doesn't double-pay.
    await t.like("maya", lines[0]!.id);
    expect(t.transfers).toHaveLength(1);
  });

  it("applies split adjustments before anyone pays", async () => {
    await t.say("jason", "I paid $52");
    await t.say("jason", "Maya had an extra drink, add $5 to hers");
    expect(t.engine.split!.lines.find((l) => l.memberId === "maya")!.amount).toBe(16.75);
    expect(t.sent.some((s) => s.text === "Maya owes Jason $16.75. Maya, react 👍 to send it.")).toBe(true);
  });

  it("warns silent members, then locks after the timeout", async () => {
    await t.say("jason", "@Rendezvous lunch tomorrow at 12");
    await t.like("jason", t.engine.plan!.proposalMessageId!);
    await t.clock.advanceMinutes(5);
    expect(t.last().text).toBe("Locking this in 10 minutes unless someone objects.");
    await t.clock.advanceMinutes(10);
    expect(["booking", "locked"]).toContain(t.engine.phase);
  });

  it("hands the pick to the organizer after three rounds", async () => {
    await t.say("jason", "@Rendezvous dinner tonight under $20");
    await t.say("maya", "can we do 8 instead");
    await t.say("dev", "can we do 7 instead");
    await t.say("ana", "later?");
    expect(t.engine.phase).toBe("picking");
    expect(t.last().text).toMatch(/Jason picks/);
    await t.say("maya", "2"); // not the organizer
    expect(t.engine.phase).toBe("picking");
    const second = t.engine.plan!.backups[0]!.venue.id;
    await t.say("jason", "2");
    expect(t.engine.plan!.option.venue.id).toBe(second);
    expect(["booking", "locked"]).toContain(t.engine.phase);
  });

  it("falls back to the next venue when the call can't book", async () => {
    await t.say("jason", "@Rendezvous dinner tonight, indian");
    await t.say("jason", "@Rendezvous dinner tonight under $25");
    const plan = t.engine.plan!;
    // Make sure we're on a phone venue for this test.
    plan.option.venue = { ...plan.option.venue, bookingMethod: "phone" };
    const backup = plan.backups[0]!.venue.name;
    await t.everyoneLikes(plan.proposalMessageId!);
    await t.engine.onCallResult({ status: "no-answer" });
    expect(t.last().text).toContain(backup);
    expect(t.engine.phase).toBe("proposed");
  });

  it("times out an unanswered question and only takes binding answers from the organizer", async () => {
    await t.say("jason", "@Rendezvous dinner tonight, indian");
    await t.everyoneLikes(t.engine.plan!.proposalMessageId!);
    const ask = t.engine.askGroup("There's a $10 cancellation fee. Is that okay?", [], true);
    await t.say("maya", "yes");
    await t.clock.advanceMinutes(1);
    await expect(ask).resolves.toEqual({ answer: null, timedOut: true });
    const ask2 = t.engine.askGroup("Is a $10 fee okay?", [], true);
    await new Promise((r) => setTimeout(r));
    await t.like("jason", t.last().id);
    await expect(ask2).resolves.toMatchObject({ answer: "yes", answeredBy: "Jason" });
  });
});

it("mentions the member in the group when a DM can't be sent", async () => {
  const t = setup({ dmFails: ["dev"] });
  await t.say("jason", "@Rendezvous coffee");
  await t.everyoneLikes(t.engine.plan!.proposalMessageId!);
  if (t.engine.phase === "booking") await t.engine.onCallResult({ status: "booked" });
  await t.engine.fastForwardDepartures();
  expect(t.sent.some((s) => s.text.startsWith("@Dev Dev, leave by "))).toBe(true);
});

it("reports a failed transfer without exposing the balance", async () => {
  const t = setup({ transferFails: true });
  await t.say("maya", "I paid $40");
  const line = t.engine.split!.lines[0]!;
  await t.like(line.memberId, line.messageId!);
  expect(t.last().text).toMatch(/^Couldn't send \$10\.00 from Jason to Maya/);
});

it("locks a reservation venue without calling when no call line is set up", async () => {
  const clock = new VirtualClock(zonedDate(2026, 10, 3, 17, 30));
  const sent: string[] = [];
  let calls = 0;
  const engine = new RendezvousEngine(
    { chatId: "c", organizerId: "a", members: [{ id: "a", name: "Jason", handle: "a", location: resolvePlace("collegetown") }] },
    {
      now: () => clock.now(),
      schedule: (at, k, f) => clock.schedule(at, k, f),
      cancel: (k) => clock.cancel(k),
      send: async (t) => (sent.push(t), `m${sent.length}`),
      dm: async () => true,
      venues: async () => ITHACA_VENUES,
      travel: (f, v) => estimateWalkMinutes(f, v.location),
      busy: async () => ({}),
      balances: async () => ({}),
      callVenue: async () => (calls++, {}),
      transfer: async () => ({ ok: true, id: "t" }),
    },
    { agentName: "Rendezvous", canCall: () => false },
  );
  await engine.onMessage({ id: "1", senderId: "a", text: "@Rendezvous dinner tonight, indian" });
  expect(engine.plan!.option.venue.bookingMethod).toBe("phone");
  await engine.onReaction({ messageId: engine.plan!.proposalMessageId!, senderId: "a", kind: "like" });
  expect(calls).toBe(0);
  expect(engine.phase).toBe("locked");
  expect(sent.at(-1)).toMatch(/takes reservations, but I can't call right now, so plan to walk in\./);
});
