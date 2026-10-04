import { describe, expect, it } from "vitest";
import { ITHACA_VENUES, RendezvousEngine, VirtualClock, estimateWalkMinutes, resolvePlace, zonedDate } from "@rendezvous/core";
import { clean } from "../src/understand.ts";

const base = {
  intent: "start_plan" as const,
  contacts: [],
  people: [],
  groups: [],
  group_name: null,
  forget_name: null,
  plan_text: null,
  change_text: null,
  choice: null,
  amount: null,
  adjust_name: null,
  reply: null,
};

describe("cleaning Grok's output", () => {
  it("keeps real numbers, drops invented or partial ones", () => {
    const r = clean({
      ...base,
      contacts: [
        { name: " Sandy ", phone: "561 317 2754" },
        { name: "Bob", phone: "555-0100" },
        { name: "", phone: "+1 607 555 0102" },
      ],
      people: [{ name: "Sandy", phone: "(561) 317-2754" }, { name: null, phone: "12" }, { name: "Maya", phone: null }],
      choice: 0,
      amount: 17.333,
    });
    expect(r.contacts).toEqual([{ name: "Sandy", phone: "+15613172754" }]);
    expect(r.people).toEqual([{ name: "Sandy", phone: "+15613172754" }, { name: "Maya", phone: undefined }]);
    expect(r.choice).toBeNull();
    expect(r.amount).toBe(17.33);
  });
});

describe("engine intent hints", () => {
  const setup = () => {
    const clock = new VirtualClock(zonedDate(2026, 10, 3, 17, 30));
    let seq = 0;
    const sent: string[] = [];
    const engine = new RendezvousEngine(
      {
        chatId: "c",
        organizerId: "a",
        members: [
          { id: "a", name: "Jason", handle: "a", location: resolvePlace("collegetown") },
          { id: "b", name: "Sandy", handle: "b", location: resolvePlace("duffield") },
        ],
      },
      {
        now: () => clock.now(),
        schedule: (at, k, f) => clock.schedule(at, k, f),
        cancel: (k) => clock.cancel(k),
        send: async (t) => (sent.push(t), `m${++seq}`),
        dm: async () => true,
        venues: async () => ITHACA_VENUES,
        travel: (f, v) => estimateWalkMinutes(f, v.location),
        busy: async () => ({}),
        balances: async () => ({}),
        callVenue: async () => ({}),
        transfer: async () => ({ ok: true, id: "t" }),
      },
      { agentName: "Rendezvous" },
    );
    return { engine, sent };
  };

  it("starts a plan without a mention when told it's a plan", async () => {
    const { engine } = setup();
    await engine.onMessage({ id: "1", senderId: "a", text: "coffee", kind: "plan" });
    expect(engine.phase).toBe("proposed");
  });

  it("treats any phrasing as approval or a change when told", async () => {
    const { engine } = setup();
    await engine.onMessage({ id: "1", senderId: "a", text: "dinner tonight", kind: "plan" });
    await engine.onMessage({ id: "2", senderId: "b", text: "omg yesss love that spot", kind: "approve" });
    expect(engine.plan!.approvals).toEqual(["b"]);
    const before = engine.plan!.round;
    await engine.onMessage({ id: "3", senderId: "a", text: "somewhere in the Commons", kind: "counter" });
    expect(engine.plan!.round).toBe(before + 1);
    expect(engine.plan!.option.venue.neighborhood).toBe("The Commons");
  });
});
