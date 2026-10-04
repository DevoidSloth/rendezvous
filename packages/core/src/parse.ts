import { addMinutes, startOfLocalDay, zonedDate, zonedParts } from "./time.ts";
import type { Activity, Member, Neighborhood, PlanConstraints, PlanRequest } from "./types.ts";

/**
 * Deterministic parsers. The agent asks Grok first and falls back to these when
 * the model is unavailable; the website demo uses them directly.
 */

const ACTIVITY_WORDS: Array<[Activity, RegExp]> = [
  ["breakfast", /\b(breakfast|brunch)\b/i],
  ["lunch", /\blunch\b/i],
  ["coffee", /\b(coffee|boba|tea)\b/i],
  ["dessert", /\b(dessert|ice cream|froyo)\b/i],
  ["drinks", /\b(drinks?|beers?|bar)\b/i],
  ["dinner", /\b(dinner|eat|food|supper)\b/i],
];

/** Hours (local, minutes after midnight) each activity usually starts in. */
const ACTIVITY_WINDOWS: Record<Activity, [number, number]> = {
  breakfast: [7 * 60, 11 * 60],
  lunch: [11 * 60, 14 * 60 + 30],
  coffee: [8 * 60, 21 * 60],
  dessert: [13 * 60, 23 * 60],
  drinks: [17 * 60, 24 * 60],
  dinner: [17 * 60, 21 * 60 + 30],
};

const NEIGHBORHOODS: Array<[Neighborhood, RegExp]> = [
  ["Collegetown", /\b(collegetown|ctown|college ?town)\b/i],
  ["The Commons", /\b(the commons|commons)\b/i],
  ["Downtown", /\bdowntown\b/i],
];

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isMention(text: string, agentName: string): boolean {
  return new RegExp(`(^|\\s)@?${escapeRegExp(agentName)}\\b`, "i").test(text);
}

export function parseActivity(text: string): Activity | undefined {
  return ACTIVITY_WORDS.find(([, re]) => re.test(text))?.[0];
}

export function parseBudget(text: string): number | undefined {
  const m =
    text.match(/(?:under|below|less than|max|<|up to|no more than)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
    text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:each|pp|per person|a head|\/person)?/i);
  return m ? Number(m[1]) : undefined;
}

export function parseCuisine(text: string): string | undefined {
  const m = text.match(/\b(pizza|thai|indian|mexican|tacos?|italian|vietnamese|pho|mediterranean|vegetarian|bagels?|pub)\b/i);
  if (!m) return undefined;
  const word = m[1]!.toLowerCase();
  return ({ taco: "mexican", tacos: "mexican", pho: "vietnamese", bagels: "bagel" } as Record<string, string>)[word] ?? word;
}

export function parseNeighborhood(text: string): Neighborhood | undefined {
  return NEIGHBORHOODS.find(([, re]) => re.test(text))?.[0];
}

/**
 * Finds a clock time like "8", "at 7:30", "8pm". Bare hours under 11 read as
 * evening unless the activity is breakfast or lunch.
 */
export function parseClockTime(text: string, activity: Activity | undefined, now: Date, dayOffset = 0): Date | undefined {
  const m =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i) ??
    text.match(/\b(?:at|by|around|for|do|say|make it|instead of)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:people|ppl|of us|\$|dollars|min))/i);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return undefined;
  const mer = m[3]?.toLowerCase().replace(/\./g, "");
  if (mer === "pm" && hour < 12) hour += 12;
  else if (mer === "am" && hour === 12) hour = 0;
  else if (!mer && hour < 12) {
    const morning = activity === "breakfast" || (activity === "lunch" && hour >= 10);
    if (!morning && hour <= 11) hour += 12;
  }
  const p = zonedParts(now);
  return zonedDate(p.year, p.month, p.day + dayOffset, hour, minute);
}

export function parseDayOffset(text: string): number {
  if (/\b(tomorrow|tmrw|tmr)\b/i.test(text)) return 1;
  return 0;
}

export function parsePartySize(text: string): number | undefined {
  const m = text.match(/\b(?:for|party of|table for)\s+(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})\s+(?:people|ppl|of us)\b/i);
  return m ? Number(m[1]) : undefined;
}

export function parseRequest(text: string, now: Date, members: Member[]): PlanRequest {
  const activity = parseActivity(text) ?? "dinner";
  const dayOffset = parseDayOffset(text);
  const [from, to] = ACTIVITY_WINDOWS[activity];
  const day = startOfLocalDay(now, dayOffset);
  let start = addMinutes(day, from);
  const end = addMinutes(day, to);
  if (start < now) start = now;
  const preferredTime = parseClockTime(text, activity, now, dayOffset);
  const constraints: PlanConstraints = { excludeVenueIds: [] };
  const hood = parseNeighborhood(text);
  if (hood) constraints.neighborhood = hood;
  const cuisine = parseCuisine(text);
  if (cuisine) constraints.cuisine = cuisine;
  if (preferredTime) constraints.preferredTime = preferredTime;
  return {
    activity,
    window: { start, end: preferredTime && preferredTime > end ? preferredTime : end },
    budgetPerPerson: parseBudget(text),
    partySize: parsePartySize(text) ?? members.length,
    statedLocations: {},
    constraints,
  };
}

export type ReplyKind = "approve" | "counter" | "other";

const APPROVAL = /^\s*(👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|yes+|yep|yup|ya|yeah|sure|ok(ay)?|works( for me)?|sounds good|down|i'?m in|in|perfect|great|bet|lgtm|let'?s go)[\s!.]*$/i;
const COUNTER =
  /\b(too far|closer|farther|somewhere|instead|can we|could we|how about|what about|rather|earlier|later|cheaper|not (?:a fan|feeling|there)|no\b|nah|different|other place|elsewhere|move it|push it)\b/i;

export function classifyReply(text: string): ReplyKind {
  if (APPROVAL.test(text)) return "approve";
  if (COUNTER.test(text) || parseNeighborhood(text) || /\b\d{1,2}(:\d{2})?\s*(am|pm)?\b/i.test(text)) return "counter";
  return "other";
}

/**
 * Turns a counter-proposal into constraint changes on top of the current plan.
 * "too far, somewhere in Collegetown" sets the area; "can we do 8 instead" sets the time.
 */
export function parseCounter(
  text: string,
  current: { venueId: string; maxTravel: number; activity: Activity; time: Date; budget?: number },
  now: Date,
): Partial<PlanConstraints> & { budgetPerPerson?: number; excludeCurrent?: boolean } {
  const out: Partial<PlanConstraints> & { budgetPerPerson?: number; excludeCurrent?: boolean } = {};
  const hood = parseNeighborhood(text);
  if (hood) out.neighborhood = hood;
  // A named area answers "too far" on its own, so the walk cap only applies without one.
  if (!hood && /\b(too far|closer|shorter walk)\b/i.test(text)) out.maxWalkMinutes = Math.max(3, current.maxTravel - 3);
  const p = zonedParts(current.time);
  const pn = zonedParts(now);
  const dayOffset = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(pn.year, pn.month - 1, pn.day)) / 86_400_000);
  const t = parseClockTime(text, current.activity, now, dayOffset);
  if (t) out.preferredTime = t;
  else if (/\bearlier\b/i.test(text)) out.preferredTime = addMinutes(current.time, -60);
  else if (/\blater\b/i.test(text)) out.preferredTime = addMinutes(current.time, 60);
  const budget = parseBudget(text);
  if (budget !== undefined) out.budgetPerPerson = budget;
  else if (/\bcheaper\b/i.test(text) && current.budget) out.budgetPerPerson = Math.max(5, current.budget - 4);
  const cuisine = parseCuisine(text);
  if (cuisine) out.cuisine = cuisine;
  const changesWhere = hood || out.maxWalkMinutes !== undefined || out.cuisine || /\b(somewhere else|different place|other place|elsewhere|not (a fan|feeling))\b/i.test(text);
  if (changesWhere) out.excludeCurrent = true;
  return out;
}

/** "I paid $52" or "paid 52.40" → 52 / 52.4 */
export function parsePayment(text: string): number | undefined {
  const m = text.match(/\b(?:i\s+)?(?:paid|covered|got|put down|spent)\b[^$\d]{0,20}\$?\s*(\d+(?:\.\d{1,2})?)/i);
  return m ? Number(m[1]) : undefined;
}

/** "Maya had an extra drink, add $5 to hers" → { name: "Maya", amount: 5 } */
export function parseAdjustment(text: string, members: Member[]): { memberId: string; amount: number } | undefined {
  const amount = text.match(/(?:add|plus|\+|extra)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ?? text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!amount) return undefined;
  const subtract = /\b(take off|subtract|minus|less|remove)\b/i.test(text);
  const named = members.find((m) => new RegExp(`\\b${escapeRegExp(m.name.split(" ")[0]!)}\\b`, "i").test(text));
  if (!named) return undefined;
  return { memberId: named.id, amount: (subtract ? -1 : 1) * Number(amount[1]) };
}

/** Picks a numbered answer ("1", "option 2", "#3") out of a reply. */
export function parseChoice(text: string, optionCount: number): number | undefined {
  const m = text.match(/^\s*(?:option\s*|#)?(\d)\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= optionCount ? n : undefined;
}
