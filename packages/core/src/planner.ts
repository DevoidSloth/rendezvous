import { KNOWN_PLACES } from "./geo.ts";
import { addMinutes, ceilToMinutes, minuteOfDay, parseClock } from "./time.ts";
import type { Interval, Member, PlanOption, PlanRequest, Place, TravelLeg, Venue } from "./types.ts";

export const BUFFER_MINUTES = 15;
export const SLOT_STEP_MINUTES = 15;
export const DEFAULT_MEAL_MINUTES = 90;

export type TravelFn = (from: Place, venue: Venue) => number | Promise<number>;

export interface PlannerInput {
  request: PlanRequest;
  members: Member[];
  venues: Venue[];
  now: Date;
  /** Busy intervals per member. A member missing here has no linked calendar and counts as free. */
  busy: Record<string, Interval[]>;
  /** Account balance per member. Used only to drop venues someone can't afford; never shown. */
  balances: Record<string, number | undefined>;
  travel: TravelFn;
  mealMinutes?: number;
  /** How many options to keep: the proposal plus backups. */
  keep?: number;
}

export interface PlanResult {
  options: PlanOption[];
  /** Members planned from a fallback location because none was shared or stated. */
  unlocated: string[];
  /** Why venues dropped out, for a useful reply when nothing fits. */
  dropped: { budget: number; area: number; hours: number; busy: number; walk: number; other: number };
}

const FALLBACK_PLACE: Place = (() => {
  const straight = KNOWN_PLACES.find((p) => p.label === "Willard Straight Hall")!;
  return { label: "campus", lat: straight.lat, lng: straight.lng };
})();

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when a meal starting at `start` fits inside the venue's hours, allowing closes past midnight. */
export function isOpenFor(venue: Venue, start: Date, mealMinutes: number): boolean {
  const open = parseClock(venue.hours.open);
  let close = parseClock(venue.hours.close);
  if (close <= open) close += 24 * 60;
  let m = minuteOfDay(start);
  if (m < open && m + 24 * 60 < close) m += 24 * 60;
  // Seat no later than an hour before close, even if the meal runs long.
  return m >= open && m + Math.min(mealMinutes, 60) <= close;
}

export function affordableLimit(request: PlanRequest, members: Member[], balances: PlannerInput["balances"]): number {
  let limit = request.budgetPerPerson ?? Number.POSITIVE_INFINITY;
  for (const m of members) {
    const bal = balances[m.id];
    if (bal !== undefined) limit = Math.min(limit, bal);
  }
  return limit;
}

/**
 * Picks the fairest venue and the earliest time that works for everyone.
 *
 * Fair means the longest walk in the group is as short as possible. A slot is
 * valid when the venue is open, everyone can leave after now, and every member
 * is free from the moment they set out until the meal ends.
 */
export async function planOptions(input: PlannerInput): Promise<PlanResult> {
  const { request, members, now } = input;
  const meal = input.mealMinutes ?? DEFAULT_MEAL_MINUTES;
  const keep = input.keep ?? 3;
  const c = request.constraints;
  const dropped = { budget: 0, area: 0, hours: 0, busy: 0, walk: 0, other: 0 };
  const unlocated = members.filter((m) => !m.location).map((m) => m.id);
  const limit = affordableLimit(request, members, input.balances);

  const candidates = input.venues.filter((v) => {
    if (c.excludeVenueIds.includes(v.id)) return (dropped.other++, false);
    if (!v.serves.includes(request.activity)) return (dropped.other++, false);
    if (c.cuisine && !v.cuisine.toLowerCase().includes(c.cuisine.toLowerCase())) return (dropped.other++, false);
    if (c.neighborhood && v.neighborhood !== c.neighborhood) return (dropped.area++, false);
    if (v.typicalSpend > limit) return (dropped.budget++, false);
    return true;
  });

  const options: PlanOption[] = [];
  for (const venue of candidates) {
    const minutes = await Promise.all(members.map((m) => input.travel(m.location ?? FALLBACK_PLACE, venue)));
    const maxTravel = Math.max(...minutes);
    if (c.maxWalkMinutes !== undefined && maxTravel > c.maxWalkMinutes) {
      dropped.walk++;
      continue;
    }

    const earliest = ceilToMinutes(addMinutes(now, maxTravel + BUFFER_MINUTES), SLOT_STEP_MINUTES);
    const first = new Date(Math.max(earliest.getTime(), ceilToMinutes(request.window.start, SLOT_STEP_MINUTES).getTime()));
    let best: Date | undefined;
    let sawOpen = false;
    for (let t = first; t <= request.window.end; t = addMinutes(t, SLOT_STEP_MINUTES)) {
      if (!isOpenFor(venue, t, meal)) continue;
      sawOpen = true;
      const everyoneFree = members.every((m, i) => {
        const busy = input.busy[m.id];
        if (!busy) return true;
        const need: Interval = { start: addMinutes(t, -minutes[i]!), end: addMinutes(t, meal) };
        return !busy.some((b) => overlaps(b, need));
      });
      if (!everyoneFree) continue;
      if (!c.preferredTime) {
        best = t;
        break;
      }
      if (!best || Math.abs(t.getTime() - c.preferredTime.getTime()) < Math.abs(best.getTime() - c.preferredTime.getTime())) {
        best = t;
      }
    }
    if (!best) {
      if (sawOpen) dropped.busy++;
      else dropped.hours++;
      continue;
    }

    const legs: TravelLeg[] = members.map((m, i) => ({
      memberId: m.id,
      minutes: minutes[i]!,
      departAt: addMinutes(best!, -minutes[i]!),
    }));
    options.push({
      venue,
      time: best,
      legs,
      maxTravel,
      totalTravel: minutes.reduce((a, b) => a + b, 0),
      assumedFree: members.filter((m) => !input.busy[m.id]).map((m) => m.id),
    });
  }

  options.sort(
    (a, b) =>
      a.maxTravel - b.maxTravel ||
      a.totalTravel - b.totalTravel ||
      a.time.getTime() - b.time.getTime() ||
      a.venue.typicalSpend - b.venue.typicalSpend,
  );
  return { options: options.slice(0, keep), unlocated, dropped };
}
