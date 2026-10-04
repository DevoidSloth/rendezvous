import { describe, expect, it } from "vitest";
import {
  ITHACA_VENUES,
  KNOWN_PLACES,
  classifyReply,
  computeSplit,
  directionsLink,
  estimateWalkMinutes,
  formatTime,
  isMention,
  isOpenFor,
  parseAdjustment,
  parseBudget,
  parseChoice,
  parseCounter,
  parsePayment,
  parseRequest,
  planOptions,
  resolvePlace,
  zonedDate,
  zonedParts,
  type Member,
} from "../src/index.ts";

const place = (alias: string) => {
  const p = KNOWN_PLACES.find((k) => k.aliases.includes(alias))!;
  return { label: p.label, lat: p.lat, lng: p.lng };
};

const members: Member[] = [
  { id: "jason", name: "Jason", handle: "+1", location: place("north campus") },
  { id: "maya", name: "Maya", handle: "+2", location: place("collegetown") },
  { id: "dev", name: "Dev", handle: "+3", location: place("duffield") },
  { id: "ana", name: "Ana", handle: "+4", location: place("west campus") },
];

// Saturday Oct 3 2026, 5:30 PM in Ithaca.
const now = zonedDate(2026, 10, 3, 17, 30);
const travel = (from: { lat: number; lng: number }, v: (typeof ITHACA_VENUES)[number]) => estimateWalkMinutes(from, v.location);

describe("time", () => {
  it("round-trips Ithaca wall-clock times", () => {
    const p = zonedParts(now);
    expect([p.month, p.day, p.hour, p.minute]).toEqual([10, 3, 17, 30]);
    expect(formatTime(now)).toBe("5:30 PM");
  });
});

describe("parsing", () => {
  it("parses the canonical mention", () => {
    const text = "@Rendezvous dinner tonight, under $15 each";
    expect(isMention(text, "Rendezvous")).toBe(true);
    const req = parseRequest(text, now, members);
    expect(req.activity).toBe("dinner");
    expect(req.budgetPerPerson).toBe(15);
    expect(req.partySize).toBe(4);
    expect(req.window.start.getTime()).toBe(now.getTime());
  });

  it("reads counter-proposals", () => {
    const current = { venueId: "ctb", maxTravel: 20, activity: "dinner" as const, time: zonedDate(2026, 10, 3, 18, 15) };
    expect(parseCounter("too far, somewhere in Collegetown", current, now)).toMatchObject({ neighborhood: "Collegetown", excludeCurrent: true });
    const t = parseCounter("can we do 8 instead", current, now).preferredTime!;
    expect(formatTime(t)).toBe("8:00 PM");
    expect(classifyReply("👍")).toBe("approve");
    expect(classifyReply("can we do 8 instead")).toBe("counter");
    expect(classifyReply("lol")).toBe("other");
  });

  it("reads payments, adjustments and choices", () => {
    expect(parsePayment("I paid $52")).toBe(52);
    expect(parsePayment("paid 48.50 for everyone")).toBe(48.5);
    expect(parseAdjustment("Maya had an extra drink, add $5 to hers", members)).toEqual({ memberId: "maya", amount: 5 });
    expect(parseChoice("1", 3)).toBe(1);
    expect(parseChoice("option 3", 3)).toBe(3);
    expect(parseChoice("4", 3)).toBeUndefined();
    expect(parseBudget("budget $20 pp")).toBe(20);
  });

  it("resolves places students mention", () => {
    expect(resolvePlace("I'm at Duffield")?.label).toBe("Duffield Hall");
    expect(resolvePlace("walking from north campus")?.label).toBe("Robert Purcell Community Center");
    expect(resolvePlace("somewhere")).toBeUndefined();
  });
});

describe("planner", () => {
  const request = () => parseRequest("@Rendezvous dinner tonight, under $15 each", now, members);

  it("minimizes the longest walk within budget", async () => {
    const res = await planOptions({ request: request(), members, venues: ITHACA_VENUES, now, busy: {}, balances: {}, travel });
    expect(res.options).toHaveLength(3);
    for (const o of res.options) expect(o.venue.typicalSpend).toBeLessThanOrEqual(15);
    const maxes = res.options.map((o) => o.maxTravel);
    expect([...maxes].sort((a, b) => a - b)).toEqual(maxes);
    // Brute force: no affordable venue has a shorter longest walk.
    const best = Math.min(
      ...ITHACA_VENUES.filter((v) => v.typicalSpend <= 15 && v.serves.includes("dinner")).map((v) =>
        Math.max(...members.map((m) => travel(m.location!, v))),
      ),
    );
    expect(res.options[0]!.maxTravel).toBe(best);
  });

  it("starts after now + longest walk + 15 minutes", async () => {
    const res = await planOptions({ request: request(), members, venues: ITHACA_VENUES, now, busy: {}, balances: {}, travel });
    for (const o of res.options) {
      expect(o.time.getTime()).toBeGreaterThanOrEqual(now.getTime() + (o.maxTravel + 15) * 60_000);
      expect(zonedParts(o.time).minute % 15).toBe(0);
      for (const l of o.legs) expect(l.departAt.getTime()).toBe(o.time.getTime() - l.minutes * 60_000);
    }
  });

  it("skips slots where anyone is busy, counting their walk", async () => {
    const busy = { maya: [{ start: now, end: zonedDate(2026, 10, 3, 19, 0) }] };
    const res = await planOptions({ request: request(), members, venues: ITHACA_VENUES, now, busy, balances: {}, travel });
    for (const o of res.options) {
      const mayaLeg = o.legs.find((l) => l.memberId === "maya")!;
      expect(mayaLeg.departAt.getTime()).toBeGreaterThanOrEqual(zonedDate(2026, 10, 3, 19, 0).getTime());
      expect(o.assumedFree).toEqual(["jason", "dev", "ana"]);
    }
  });

  it("drops venues a member can't afford without exposing why", async () => {
    const res = await planOptions({ request: request(), members, venues: ITHACA_VENUES, now, busy: {}, balances: { dev: 12 }, travel });
    for (const o of res.options) expect(o.venue.typicalSpend).toBeLessThanOrEqual(12);
    expect(res.dropped.budget).toBeGreaterThan(0);
  });

  it("honors a preferred time and an area", async () => {
    const req = request();
    req.constraints.preferredTime = zonedDate(2026, 10, 3, 20, 0);
    req.constraints.neighborhood = "The Commons";
    const res = await planOptions({ request: req, members, venues: ITHACA_VENUES, now, busy: {}, balances: {}, travel });
    expect(res.options.length).toBeGreaterThan(0);
    for (const o of res.options) {
      expect(o.venue.neighborhood).toBe("The Commons");
      expect(formatTime(o.time)).toBe("8:00 PM");
    }
  });

  it("respects hours that run past midnight", () => {
    const nines = ITHACA_VENUES.find((v) => v.id === "the-nines")!;
    expect(isOpenFor(nines, zonedDate(2026, 10, 3, 23, 30), 90)).toBe(true);
    expect(isOpenFor(nines, zonedDate(2026, 10, 3, 15, 0), 90)).toBe(false);
  });
});

describe("split", () => {
  it("matches the spec example", () => {
    const three = members.slice(0, 3);
    const s = computeSplit("chat", "jason", 52, three);
    expect(s.lines.map((l) => [l.memberId, l.amount])).toEqual([
      ["maya", 17.33],
      ["dev", 17.33],
    ]);
  });

  it("applies adjustments and still sums to the total", () => {
    const s = computeSplit("chat", "jason", 52, members, { maya: 5 });
    expect(s.lines.find((l) => l.memberId === "maya")!.amount).toBe(16.75);
    expect(s.lines.find((l) => l.memberId === "dev")!.amount).toBe(11.75);
    const payerShare = 52 - s.lines.reduce((a, l) => a + l.amount, 0);
    expect(payerShare).toBeCloseTo(11.75, 2);
  });
});

it("builds the spec's Maps link", () => {
  expect(directionsLink({ lat: 42.4421, lng: -76.48533 })).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=42.442100,-76.485330&travelmode=walking",
  );
});
