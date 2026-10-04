export const TIME_ZONE = "America/New_York";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(date: Date): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour! % 24,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Builds the instant for a wall-clock time in Ithaca. Day overflow (day + 1) is allowed. */
export function zonedDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = asUtc - guess;
  const result = new Date(guess - offset);
  // Correct once more across DST boundaries.
  const p2 = zonedParts(result);
  const asUtc2 = Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute);
  const drift = asUtc2 - Date.UTC(year, month - 1, day, hour, minute);
  return drift === 0 ? result : new Date(result.getTime() - drift);
}

/** Minutes after local midnight in Ithaca. */
export function minuteOfDay(date: Date): number {
  const p = zonedParts(date);
  return p.hour * 60 + p.minute;
}

export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function ceilToMinutes(date: Date, step: number): Date {
  const ms = step * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

export function startOfLocalDay(date: Date, plusDays = 0): Date {
  const p = zonedParts(date);
  return zonedDate(p.year, p.month, p.day + plusDays, 0, 0);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDay(date: Date, now = new Date()): string {
  const day = startOfLocalDay(date).getTime();
  const today = startOfLocalDay(now).getTime();
  if (day === today) return "tonight";
  if (day === startOfLocalDay(now, 1).getTime()) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long" }).format(date);
}
