import {
  addMinutes,
  parseRequest,
  startOfLocalDay,
  zonedDate,
  zonedParts,
  type Activity,
  type CounterChange,
  type Member,
  type Neighborhood,
  type Plan,
  type PlanRequest,
} from "@rendezvous/core";
import { config } from "./config.ts";

/**
 * Grok reads the group's asks. It only extracts structure; the planner and
 * message templates stay deterministic so the demo says the same thing twice.
 */

const ACTIVITIES: Activity[] = ["breakfast", "lunch", "dinner", "coffee", "drinks", "dessert"];
const NEIGHBORHOODS: Neighborhood[] = ["Collegetown", "The Commons", "Downtown", "Campus", "North Campus"];

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

const REQUEST_SCHEMA = {
  type: "object",
  properties: {
    activity: { type: "string", enum: ACTIVITIES },
    day_offset: { type: "integer", description: "0 for today/tonight, 1 for tomorrow" },
    preferred_time: nullable({ type: "string", description: "24h HH:MM local time if one was named" }),
    budget_per_person: nullable({ type: "number" }),
    party_size: nullable({ type: "integer" }),
    neighborhood: nullable({ type: "string", enum: NEIGHBORHOODS }),
    cuisine: nullable({ type: "string", description: "one lowercase word, e.g. thai, pizza, indian" }),
    seating: nullable({ type: "string" }),
    accessibility: nullable({ type: "string" }),
  },
  required: ["activity", "day_offset", "preferred_time", "budget_per_person", "party_size", "neighborhood", "cuisine", "seating", "accessibility"],
  additionalProperties: false,
};

const COUNTER_SCHEMA = {
  type: "object",
  properties: {
    neighborhood: nullable({ type: "string", enum: NEIGHBORHOODS }),
    preferred_time: nullable({ type: "string", description: "24h HH:MM local time" }),
    shift_minutes: nullable({ type: "integer", description: "relative move like 'an hour later' = 60" }),
    max_walk_minutes: nullable({ type: "integer" }),
    budget_per_person: nullable({ type: "number" }),
    cuisine: nullable({ type: "string" }),
    exclude_current_venue: { type: "boolean", description: "true when they want a different place" },
  },
  required: ["neighborhood", "preferred_time", "shift_minutes", "max_walk_minutes", "budget_per_person", "cuisine", "exclude_current_venue"],
  additionalProperties: false,
};

export async function complete<T>(system: string, user: string, name: string, schema: object): Promise<T> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.xaiApiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      model: config.grokModel,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(body.choices[0]!.message.content) as T;
}

function clockOn(now: Date, dayOffset: number, hhmm: string): Date | undefined {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const p = zonedParts(now);
  return zonedDate(p.year, p.month, p.day + dayOffset, Number(m[1]), Number(m[2]));
}

export const nowLine = (now: Date) =>
  `It is ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "numeric", minute: "2-digit" }).format(now)} in Ithaca, NY.`;

export async function grokUnderstandRequest(text: string, members: Member[], now: Date): Promise<PlanRequest | null> {
  if (!config.xaiApiKey) return null;
  const out = await complete<{
    activity: Activity;
    day_offset: number;
    preferred_time: string | null;
    budget_per_person: number | null;
    party_size: number | null;
    neighborhood: Neighborhood | null;
    cuisine: string | null;
    seating: string | null;
    accessibility: string | null;
  }>(
    `You read requests sent to ${config.agentName}, an assistant that plans meetups for a group chat of Cornell students in Ithaca. ${nowLine(now)} Extract only what the message says; use null for anything not stated. A bare hour like "8" for dinner means 20:00.`,
    text,
    "plan_request",
    REQUEST_SCHEMA,
  );
  // Start from the deterministic parse for windows, then trust Grok's fields.
  const base = parseRequest(text, now, members);
  const dayOffset = Math.max(0, Math.min(6, out.day_offset));
  const parsedWindow = parseRequest(`${out.activity}${dayOffset ? " tomorrow" : ""}`, now, members).window;
  const preferredTime = out.preferred_time ? clockOn(now, dayOffset, out.preferred_time) : undefined;
  const window = { ...parsedWindow };
  if (preferredTime && preferredTime > window.end) window.end = preferredTime;
  if (window.start < now) window.start = now;
  if (window.end <= window.start) window.end = addMinutes(startOfLocalDay(now, dayOffset), 24 * 60);
  return {
    ...base,
    activity: out.activity,
    window,
    budgetPerPerson: out.budget_per_person ?? undefined,
    partySize: out.party_size ?? members.length,
    constraints: {
      excludeVenueIds: [],
      neighborhood: out.neighborhood ?? undefined,
      preferredTime,
      cuisine: out.cuisine ?? undefined,
      seating: out.seating ?? undefined,
      accessibility: out.accessibility ?? undefined,
    },
  };
}

export async function grokUnderstandCounter(text: string, plan: Plan, now: Date): Promise<CounterChange | null> {
  if (!config.xaiApiKey) return null;
  const p = zonedParts(plan.option.time);
  const out = await complete<{
    neighborhood: Neighborhood | null;
    preferred_time: string | null;
    shift_minutes: number | null;
    max_walk_minutes: number | null;
    budget_per_person: number | null;
    cuisine: string | null;
    exclude_current_venue: boolean;
  }>(
    `A group is reviewing this proposal: ${plan.option.venue.name} (${plan.option.venue.neighborhood}) at ${p.hour}:${String(p.minute).padStart(2, "0")}, longest walk ${plan.option.maxTravel} minutes. ${nowLine(now)} Turn the reply into changes. Use null for anything the reply doesn't change. "Too far" with no area means max_walk_minutes a few minutes under the current longest walk.`,
    text,
    "counter",
    COUNTER_SCHEMA,
  );
  const pn = zonedParts(now);
  const dayOffset = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(pn.year, pn.month - 1, pn.day)) / 86_400_000);
  const change: CounterChange = { excludeCurrent: out.exclude_current_venue };
  if (out.neighborhood) change.neighborhood = out.neighborhood;
  if (out.preferred_time) change.preferredTime = clockOn(now, dayOffset, out.preferred_time);
  else if (out.shift_minutes) change.preferredTime = addMinutes(plan.option.time, out.shift_minutes);
  if (out.max_walk_minutes) change.maxWalkMinutes = out.max_walk_minutes;
  if (out.budget_per_person) change.budgetPerPerson = out.budget_per_person;
  if (out.cuisine) change.cuisine = out.cuisine;
  return change;
}
