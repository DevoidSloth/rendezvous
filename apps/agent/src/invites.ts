/**
 * Pulls invitees out of an organizer's text:
 *   "dinner tonight with Sandy 561-317-2754 and Maya (607) 555-0102"
 *   "add Dev +16075550103"
 *   "with Sandy and Maya"   (names already known from the roster or Photon users)
 */

const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const STOP_WORDS = new Set(["with", "and", "add", "invite", "plus", "me", "us", "the", "at", "for", "to", "from", "tonight", "tomorrow"]);

export interface Invite {
  name?: string;
  phone?: string;
}

export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function parseInvites(text: string, knownNames: string[]): Invite[] {
  const out: Invite[] = [];
  for (const m of text.matchAll(PHONE)) {
    const before = text.slice(0, m.index).trimEnd().replace(/[:(,-]+$/, "").trimEnd();
    const word = before.split(/\s+/).at(-1) ?? "";
    const name = /^[A-Za-z][A-Za-z'-]{1,}$/.test(word) && !STOP_WORDS.has(word.toLowerCase()) ? cap(word) : undefined;
    out.push({ name, phone: toE164(m[0]) });
  }
  // Names without numbers, only after "with" / "add" / "invite", and only if we know them.
  const tail = text.replace(PHONE, " ").match(/\b(?:with|add|invite)\b(.*)$/i)?.[1] ?? "";
  // Longest names first, so "Sandy Lee" wins over "Sandy"; matched spans aren't reused.
  const found: Array<{ at: number; name: string }> = [];
  let rest = tail;
  for (const name of [...new Set(knownNames)].sort((a, b) => b.length - a.length)) {
    const m = rest.match(new RegExp(`(^|[^A-Za-z])(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![A-Za-z])`, "i"));
    if (!m) continue;
    const at = m.index! + m[1]!.length;
    found.push({ at, name });
    rest = rest.slice(0, at) + " ".repeat(name.length) + rest.slice(at + name.length);
  }
  for (const f of found.sort((a, b) => a.at - b.at)) {
    if (!out.some((i) => i.name?.toLowerCase() === f.name.toLowerCase())) out.push({ name: f.name });
  }
  return out;
}

/** The text with phone numbers removed, so the planner doesn't read digits as times or budgets. */
export function withoutPhones(text: string): string {
  return text.replace(PHONE, " ").replace(/\s{2,}/g, " ").trim();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Capitalized names right after "with", "and", "add", "invite" or a comma that
 * we have no number for ("dinner with Bob"), so the agent can ask for one.
 */
export function unknownNames(text: string, knownNames: string[], exclude: string[] = []): string[] {
  const tail = text.replace(PHONE, " ").match(/\b(?:with|add|invite)\b(.*)$/i)?.[1] ?? "";
  const skip = new Set([...knownNames, ...exclude].flatMap((n) => n.toLowerCase().split(/\s+/)));
  const out: string[] = [];
  for (const m of tail.matchAll(/(?:^|,|\band\b|\bwith\b|\badd\b|\binvite\b|&)\s*([A-Z][a-z'-]+)/g)) {
    const word = m[1]!;
    if (!skip.has(word.toLowerCase()) && !STOP_WORDS.has(word.toLowerCase()) && !out.includes(word)) out.push(word);
  }
  return out;
}
