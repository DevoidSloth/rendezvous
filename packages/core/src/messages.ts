import { directionsLink } from "./geo.ts";
import { formatMoney } from "./split.ts";
import { formatDay, formatTime } from "./time.ts";
import { priceRange } from "./venues.ts";
import type { Member, PlanOption, Venue } from "./types.ts";

/**
 * Every message the agent sends. The website demo renders these same strings,
 * so what judges see on the page is what lands in the group chat.
 */

const first = (m: Member) => m.name.split(" ")[0]!;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function listNames(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function proposalMessage(option: PlanOption, members: Member[], opts: { round: number; now?: Date; unlocated?: string[] }): string {
  const { venue, time, legs } = option;
  const byId = new Map(members.map((m) => [m.id, m]));
  const walks = legs
    .map((l) => {
      const m = byId.get(l.memberId)!;
      const flag = opts.unlocated?.includes(m.id) ? " (guessing, share your location?)" : "";
      return `${first(m)} ${l.minutes} min${flag}`;
    })
    .join("\n");
  const free = !option.assumedFree.length
    ? ""
    : option.assumedFree.length === members.length
      ? "\nNo calendars are linked, so I assumed everyone's free."
      : `\n${listNames(option.assumedFree.map((id) => first(byId.get(id)!)))} ${option.assumedFree.length === 1 ? "has" : "have"} no calendar linked, so I assumed free.`;
  const lead = opts.round > 1 ? "New plan:" : "How about this:";
  return `${lead} ${venue.name}, ${formatDay(time, opts.now)} at ${formatTime(time)}.
${capitalize(venue.cuisine)}, ${priceRange(venue.priceLevel)} a person, ${venue.neighborhood}.

Walks:
${walks}${free}

React 👍 to lock it in, or reply with a change.`;
}

export const silenceWarning = (minutes = 10) => `Locking this in ${minutes} minutes unless someone objects.`;

export function organizerPicksMessage(organizer: Member, options: PlanOption[]): string {
  const list = options.map((o, i) => `${i + 1}. ${o.venue.name} at ${formatTime(o.time)}`).join("\n");
  return `Three rounds in, so ${first(organizer)} picks. Reply with a number:\n${list}`;
}

export function lockedMessage(option: PlanOption, booked: boolean): string {
  const how = booked ? "Table booked" : "Locked";
  return `${how}: ${option.venue.name} at ${formatTime(option.time)}. I'll text each of you when it's time to leave.`;
}

export const callingMessage = (venue: Venue) => `Calling ${venue.name} to book the table. I'll check with you here if they ask anything.`;

export function askGroupMessage(question: string, options: string[]): string {
  if (!options.length) return `${question}\nThe host is waiting on the line. 👍 for yes, or just reply.`;
  const list = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
  return `The host is asking: ${question}\n${list}\nReply with a number.`;
}

export function departureDM(member: Member, option: PlanOption, minutes: number): string {
  const leaveBy = new Date(option.time.getTime() - minutes * 60_000);
  return `${first(member)}, leave by ${formatTime(leaveBy)} for ${option.venue.name}. The walk is ${minutes} min and the table is at ${formatTime(option.time)}.
${directionsLink(option.venue.location)}`;
}

export function owesMessage(debtor: Member, payer: Member, amount: number): string {
  return `${first(debtor)} owes ${first(payer)} ${formatMoney(amount)}. ${first(debtor)}, react 👍 to send it.`;
}

export function transferDoneMessage(debtor: Member, payer: Member, amount: number): string {
  return `${first(debtor)} → ${first(payer)} ${formatMoney(amount)} ✓`;
}

export function transferFailedMessage(debtor: Member, payer: Member, amount: number): string {
  return `Couldn't send ${formatMoney(amount)} from ${first(debtor)} to ${first(payer)}. The transfer didn't go through, so settle this one directly.`;
}

export function noOptionsMessage(dropped: { budget: number; area: number; hours: number; busy: number; walk: number }): string {
  const top = Object.entries(dropped).sort((a, b) => b[1] - a[1])[0];
  const hint: Record<string, string> = {
    budget: "Everything nearby is over budget. Try raising it a few dollars.",
    area: "Nothing in that area fits. Try another neighborhood.",
    hours: "Nothing's open in that window. Try a different time.",
    busy: "There's no time everyone's free. Try another day.",
    walk: "Nothing's that close for everyone. Try allowing a longer walk.",
  };
  return `I couldn't find a spot that works. ${(top && top[1] > 0 && hint[top[0]]) || "Try a different time or area."}`;
}
