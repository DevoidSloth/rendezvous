import type { Phase } from "@rendezvous/core";
import { config } from "./config.ts";
import { complete, nowLine } from "./grok.ts";
import { toE164, type Invite } from "./invites.ts";

/**
 * Reads any 1:1 message with Grok and turns it into one action, so people can
 * phrase things however they like ("hey save my roommate sandy, she's
 * 561 317 2754", "eh I'm not feeling pizza", "ok I covered it, 52 bucks").
 * Returns null when Grok is unavailable; callers fall back to the parsers.
 */

export type Intent =
  | "save_contacts"
  | "save_group"
  | "save_current_group"
  | "list_contacts"
  | "list_groups"
  | "forget"
  | "start_plan"
  | "add_people"
  | "approve"
  | "change_plan"
  | "choose_option"
  | "paid"
  | "adjust_split"
  | "leave"
  | "chat";

export interface Person {
  name: string | null;
  phone: string | null;
}

/** What Grok returns, before cleaning. */
interface RawRouted extends Omit<Routed, "people"> {
  people: Person[];
}

export interface Routed {
  intent: Intent;
  /** New name/number pairs to remember, from any intent. */
  contacts: Array<{ name: string; phone: string }>;
  /** People to bring into the plan (start_plan, add_people) or into a saved group (save_group). */
  people: Invite[];
  /** Saved groups named in the message ("with the roommates"). */
  groups: string[];
  group_name: string | null;
  forget_name: string | null;
  /** start_plan: the request restated plainly, e.g. "dinner tonight under $15 at 7pm in Collegetown". */
  plan_text: string | null;
  /** change_plan: the change restated plainly, e.g. "somewhere in Collegetown" or "at 8pm". */
  change_text: string | null;
  choice: number | null;
  amount: number | null;
  adjust_name: string | null;
  /** chat: a short, friendly reply to send back. */
  reply: string | null;
}

export interface RouteContext {
  agentName: string;
  now: Date;
  senderName: string;
  phase: Phase | "none";
  isOrganizer: boolean;
  /** Numbered options when the group has an open question, e.g. from the venue call. */
  openQuestion: { question: string; options: string[] } | null;
  members: string[];
  contacts: string[];
  groups: string[];
  hasUnpaidShare: boolean;
}

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const INTENTS: Intent[] = [
  "save_contacts",
  "save_group",
  "save_current_group",
  "list_contacts",
  "list_groups",
  "forget",
  "start_plan",
  "add_people",
  "approve",
  "change_plan",
  "choose_option",
  "paid",
  "adjust_split",
  "leave",
  "chat",
];

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    contacts: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" } }, required: ["name", "phone"], additionalProperties: false },
    },
    people: {
      type: "array",
      items: { type: "object", properties: { name: nullable({ type: "string" }), phone: nullable({ type: "string" }) }, required: ["name", "phone"], additionalProperties: false },
    },
    groups: { type: "array", items: { type: "string" } },
    group_name: nullable({ type: "string" }),
    forget_name: nullable({ type: "string" }),
    plan_text: nullable({ type: "string" }),
    change_text: nullable({ type: "string" }),
    choice: nullable({ type: "integer" }),
    amount: nullable({ type: "number" }),
    adjust_name: nullable({ type: "string" }),
    reply: nullable({ type: "string" }),
  },
  required: ["intent", "contacts", "people", "groups", "group_name", "forget_name", "plan_text", "change_text", "choice", "amount", "adjust_name", "reply"],
  additionalProperties: false,
};

function systemPrompt(ctx: RouteContext): string {
  const q = ctx.openQuestion ? `Open question to the group: "${ctx.openQuestion.question}" Options: ${ctx.openQuestion.options.map((o, i) => `${i + 1}. ${o}`).join(" ")}.` : "No open question.";
  return `You read one iMessage sent 1:1 to ${ctx.agentName}, an assistant that plans meetups for Cornell students in Ithaca. ${nowLine(ctx.now)}
Sender: ${ctx.senderName}${ctx.isOrganizer ? " (organizer of the current plan)" : ""}.
Current plan stage: ${ctx.phase}. People in the plan: ${ctx.members.join(", ") || "none"}.
${q}
${ctx.hasUnpaidShare ? "The sender owes a share of a bill that hasn't been paid yet." : ""}
The sender's saved contacts: ${ctx.contacts.join(", ") || "none"}. Saved groups: ${ctx.groups.join(", ") || "none"}.

Pick the single intent that best fits:
- save_contacts: giving names and numbers to remember, without planning anything.
- save_group: defining a named group of people ("my roommates are Sandy and Maya").
- save_current_group: saving everyone in the current plan as a named group.
- list_contacts / list_groups: asking what's saved.
- forget: deleting a saved contact or group (forget_name).
- start_plan: asking to plan something new (a meal, coffee, drinks, hanging out). Put the request in plan_text in plain words, without names or numbers.
- add_people: adding people to the current plan without changing anything else.
- approve: agreeing to the proposed plan ("sounds good", "I'm down", "works").
- change_plan: wanting a different place, area, time, budget or food for the proposed plan. Put the change in change_text in plain words, like "somewhere in Collegetown", "at 8pm", "cheaper", "not pizza".
- choose_option: answering the open question; choice is the 1-based option number.
- paid: saying they paid the bill; amount in dollars.
- adjust_split: changing someone's share ("Maya had an extra drink, add $5 to hers"); adjust_name and amount (negative to take off).
- leave: wanting out of the plan.
- chat: anything else; put a short, friendly, plain reply in reply that helps them toward a plan.

Always: list every name and phone number pair the message gives in contacts, whatever the intent. Put people to invite in people (name and/or phone exactly as written; use a saved contact's name when they refer to one). Put saved group names they mention in groups. Use null or empty lists for anything not stated. Never invent phone numbers.`;
}

/** After a failure, skip Grok for a while instead of paying a failed round trip on every message. */
let pausedUntil = 0;

export async function routeMessage(text: string, ctx: RouteContext): Promise<Routed | null> {
  if (!config.xaiApiKey || Date.now() < pausedUntil) return null;
  try {
    const out = await complete<RawRouted>(systemPrompt(ctx), text, "route", SCHEMA);
    return clean(out);
  } catch (err) {
    const msg = String(err);
    // No credits or a bad key won't fix itself in seconds; a timeout might.
    pausedUntil = Date.now() + (/40[13]/.test(msg) ? 5 * 60_000 : 30_000);
    console.warn("[route] Grok unavailable, using the built-in parsers:", msg.slice(0, 160));
    return null;
  }
}

const validPhone = (raw: string | null): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) return null;
  return toE164(raw);
};

/** Drops anything malformed the model returned: bad numbers, empty names, out-of-range choices. */
export function clean(r: RawRouted): Routed {
  const contacts = r.contacts
    .map((c) => ({ name: c.name.trim(), phone: validPhone(c.phone) }))
    .filter((c): c is { name: string; phone: string } => Boolean(c.name && c.phone));
  const people: Invite[] = r.people
    .map((p) => ({ name: p.name?.trim() || undefined, phone: validPhone(p.phone) ?? undefined }))
    .filter((p) => p.name || p.phone);
  return {
    ...r,
    contacts,
    people,
    groups: r.groups.map((g) => g.trim()).filter(Boolean),
    choice: r.choice && r.choice > 0 ? r.choice : null,
    amount: r.amount !== null && Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null,
  };
}
