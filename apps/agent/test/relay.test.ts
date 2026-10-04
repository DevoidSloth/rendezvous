import { describe, expect, it } from "vitest";
import { ITHACA_VENUES, RendezvousEngine, VirtualClock, estimateWalkMinutes, resolvePlace, zonedDate, type Member } from "@rendezvous/core";
import { RelayGroup, type Thread } from "../src/relay.ts";

function setup() {
  const clock = new VirtualClock(zonedDate(2026, 10, 3, 17, 30));
  const inbox = new Map<string, Array<{ id: string; text: string }>>();
  let seq = 0;
  const threads = new Map<string, Thread>();
  const threadFor = (id: string): Thread => {
    let t = threads.get(id);
    if (!t) {
      t = {
        send: async (text) => {
          const msg = { id: `${id}-${++seq}`, text };
          inbox.set(id, [...(inbox.get(id) ?? []), msg]);
          return { id: msg.id };
        },
      };
      threads.set(id, t);
    }
    return t;
  };
  const m = (id: string, name: string, place: string): Member => ({ id, name, handle: id, location: resolvePlace(place) });
  const members = [m("+16075550101", "Jason", "north campus"), m("+16075550102", "Maya", "collegetown")];
  const relay = new RelayGroup(
    members,
    async (member) => threadFor(member.id),
    (ms, send) =>
      new RendezvousEngine({ chatId: "relay", members: ms, organizerId: ms[0]?.id ?? "" }, {
        now: () => clock.now(),
        schedule: (at, key, fn) => clock.schedule(at, key, fn),
        cancel: (key) => clock.cancel(key),
        send,
        dm: async (member, text) => {
          await threadFor(member.id).send(text);
          return true;
        },
        venues: async () => ITHACA_VENUES,
        travel: (from, v) => estimateWalkMinutes(from, v.location),
        busy: async () => ({}),
        balances: async () => ({}),
        callVenue: async () => ({}),
        transfer: async () => ({ ok: true, id: "t" }),
      }, { agentName: "Rendezvous" }),
    "Rendezvous",
  );
  const last = (id: string) => inbox.get(id)?.at(-1);
  return { relay, inbox, threadFor, last, members };
}

describe("relay group over 1:1 threads", () => {
  it("relays messages, broadcasts proposals and counts a tapback from each thread", async () => {
    const { relay, last } = setup();
    const [jason, maya] = relay.members;
    await relay.onText(jason!, "in1", "@Rendezvous coffee");
    // Maya sees Jason's message, then the proposal; Jason sees only the proposal.
    expect(relay.engine.phase).toBe("proposed");
    expect(last(maya!.id)!.text).toMatch(/^How about this/);
    expect(last(jason!.id)!.text).toMatch(/^How about this/);
    // Each person taps 👍 on their own copy.
    await relay.engine.onReaction({ messageId: relay.logicalId(last(jason!.id)!.id), senderId: jason!.id, kind: "like" });
    expect(relay.engine.plan!.approvals).toEqual([jason!.id]);
    await relay.engine.onReaction({ messageId: relay.logicalId(last(maya!.id)!.id), senderId: maya!.id, kind: "like" });
    expect(["locked", "booking"]).toContain(relay.engine.phase);
  });

  it("shows each person's text to everyone else", async () => {
    const { relay, inbox } = setup();
    const [jason, maya] = relay.members;
    await relay.onText(maya!, "in1", "running 5 late");
    expect(inbox.get(jason!.id)!.map((m) => m.text)).toContain("Maya: running 5 late");
    expect(inbox.get(maya!.id)).toBeUndefined();
  });

  it("introduces an invitee in their own thread and tells the others", async () => {
    const { relay, inbox, threadFor } = setup();
    const [jason] = relay.members;
    const sandy: Member = { id: "+15613172754", name: "Sandy", handle: "+15613172754" };
    await relay.invite(sandy, threadFor(sandy.id), jason!);
    expect(inbox.get(sandy.id)![0]!.text).toMatch(/^Hi Sandy! Jason is making plans with you, Maya through Rendezvous, an AI assistant\./);
    expect(inbox.get(jason!.id)!.at(-1)!.text).toBe("Added Sandy.");
    // Inviting twice is a no-op.
    await relay.invite(sandy, threadFor(sandy.id), jason!);
    expect(relay.members).toHaveLength(3);
    await relay.leave(sandy);
    expect(relay.members).toHaveLength(2);
    expect(inbox.get(jason!.id)!.at(-1)!.text).toBe("Sandy left the plan.");
  });

  it("doesn't add someone whose intro can't be sent", async () => {
    const { relay } = setup();
    const [jason] = relay.members;
    const sandy: Member = { id: "+15613172754", name: "Sandy", handle: "+15613172754" };
    const blocked = { send: async () => Promise.reject(new Error("Target not allowed for this project")) };
    await expect(relay.invite(sandy, blocked, jason!)).rejects.toThrow(/not allowed/);
    expect(relay.members.map((m) => m.name)).toEqual(["Jason", "Maya"]);
  });

  it("lets a new person join and tells the others", async () => {
    const { relay, inbox, threadFor } = setup();
    const ana: Member = { id: "+16075550104", name: "Ana", handle: "+16075550104" };
    await relay.join(ana, threadFor(ana.id));
    expect(inbox.get(ana.id)![0]!.text).toMatch(/^You're in the group with Jason, Maya/);
    expect(inbox.get("+16075550101")!.at(-1)!.text).toBe("Ana joined the group.");
    expect(relay.members).toHaveLength(3);
  });
});
