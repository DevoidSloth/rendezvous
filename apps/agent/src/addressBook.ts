import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { escapeRegExp } from "@rendezvous/core";
import { normalizeHandle } from "./roster.ts";

/**
 * Each organizer's own contacts and saved groups, so "dinner with Sandy" or
 * "lunch with roommates" works after the first time. Stored per organizer;
 * nobody else can see or use someone's address book.
 */

export interface Contact {
  name: string;
  phone: string;
}

export interface SavedGroup {
  name: string;
  /** Contact phones, E.164. */
  members: string[];
}

interface Book {
  contacts: Record<string, Contact>;
  groups: Record<string, SavedGroup>;
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const tidy = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export class AddressBook {
  private books: Record<string, Book> = {};

  constructor(private file?: string) {
    if (file && existsSync(file)) this.books = JSON.parse(readFileSync(file, "utf8")) as Record<string, Book>;
  }

  private book(owner: string): Book {
    return (this.books[normalizeHandle(owner)] ??= { contacts: {}, groups: {} });
  }

  private persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // Write then rename so a crash mid-write can't corrupt the book.
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.books, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Saves or updates a contact. Returns true when something changed. */
  saveContact(owner: string, name: string, phone: string): boolean {
    const b = this.book(owner);
    const contact = { name: tidy(name), phone: normalizeHandle(phone) };
    const prev = b.contacts[key(name)];
    if (prev && prev.phone === contact.phone && prev.name === contact.name) return false;
    b.contacts[key(name)] = contact;
    this.persist();
    return true;
  }

  contact(owner: string, name: string): Contact | undefined {
    return this.book(owner).contacts[key(name)];
  }

  contactByPhone(owner: string, phone: string): Contact | undefined {
    const id = normalizeHandle(phone);
    return Object.values(this.book(owner).contacts).find((c) => c.phone === id);
  }

  contacts(owner: string): Contact[] {
    return Object.values(this.book(owner).contacts).sort((a, b) => a.name.localeCompare(b.name));
  }

  saveGroup(owner: string, name: string, phones: string[]) {
    const members = [...new Set(phones.map(normalizeHandle))].filter((p) => p !== normalizeHandle(owner));
    this.book(owner).groups[key(name)] = { name: tidy(name), members };
    this.persist();
  }

  group(owner: string, name: string): SavedGroup | undefined {
    return this.book(owner).groups[key(name)];
  }

  groups(owner: string): SavedGroup[] {
    return Object.values(this.book(owner).groups).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Removes a contact or group by name. Returns what was removed. */
  forget(owner: string, name: string): "contact" | "group" | undefined {
    const b = this.book(owner);
    if (b.groups[key(name)]) {
      delete b.groups[key(name)];
      this.persist();
      return "group";
    }
    if (b.contacts[key(name)]) {
      delete b.contacts[key(name)];
      this.persist();
      return "contact";
    }
    return undefined;
  }

  /** Saved groups named after "with", "add" or "invite", e.g. "lunch with the roommates". */
  groupsIn(owner: string, text: string): SavedGroup[] {
    const tail = text.match(/\b(?:with|add|invite)\b(.*)$/i)?.[1] ?? "";
    return this.groups(owner).filter((g) => new RegExp(`(^|[^a-z])${escapeRegExp(key(g.name))}([^a-z]|$)`, "i").test(tail));
  }

  /** Display name for a phone in this owner's book. */
  nameFor(owner: string, phone: string): string | undefined {
    return this.contactByPhone(owner, phone)?.name;
  }
}

export type BookCommand =
  | { kind: "saveContact"; name: string; phone: string }
  | { kind: "saveGroup"; name: string; list: string }
  | { kind: "saveCurrentGroup"; name: string }
  | { kind: "listContacts" }
  | { kind: "listGroups" }
  | { kind: "forget"; name: string };

const PHONE = String.raw`((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})`;

/** Recognizes address-book commands. Anything else returns undefined and goes to planning. */
export function parseBookCommand(text: string): BookCommand | undefined {
  const t = text.trim();
  let m = t.match(/^(?:save|make|create|new)\s+(?:a\s+)?(?:this|the|current)\s+group\s+as\s+(.+?)[.!]?$/i);
  if (m) return { kind: "saveCurrentGroup", name: m[1]! };
  m = t.match(/^(?:save|make|create|new)\s+(?:a\s+)?group\s+(?:called\s+|named\s+)?(.+?)\s*(?::|-|=|\bwith\b)\s*(.+)$/i);
  if (m) return { kind: "saveGroup", name: m[1]!, list: m[2]! };
  if (/^(?:save|remember|add contact|new contact)\b/i.test(t)) {
    const pair = contactPairs(t.replace(/^(?:save|remember|add contact|new contact)\s+/i, ""))[0];
    if (pair) return { kind: "saveContact", name: pair.name, phone: pair.phone };
  }
  m = t.match(new RegExp(String.raw`^(?:save|remember|add contact|new contact)\s+(?:contact\s+)?([A-Za-z][A-Za-z' -]*?)\s*(?:as|is|at|:|-|=)?\s*${PHONE}\s*[.!]?$`, "i"));
  if (m) return { kind: "saveContact", name: m[1]!, phone: m[2]! };
  if (/^(?:my\s+|show\s+(?:my\s+)?|list\s+(?:my\s+)?)?contacts\??$/i.test(t)) return { kind: "listContacts" };
  if (/^(?:my\s+|show\s+(?:my\s+)?|list\s+(?:my\s+)?)?groups\??$/i.test(t)) return { kind: "listGroups" };
  m = t.match(/^(?:forget|delete|remove)\s+(?:contact\s+|group\s+)?(.+?)[.!]?$/i);
  if (m) return { kind: "forget", name: m[1]! };
  return undefined;
}

const NAME = String.raw`([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*)?)`;
const FILLER = /^(?:my|friend|the|this|is|it's|its|here's|heres|number|phone|cell)$/i;

/**
 * Name/number pairs said any natural way:
 *   "Sandy's number is 561-317-2754", "the number for Sandy is …",
 *   "Sandy is 561…", "my friend Sandy: 561…", "Sandy 561…"
 */
export function contactPairs(text: string): Array<{ name: string; phone: string }> {
  const out: Array<{ name: string; phone: string }> = [];
  const add = (name: string, phone: string) => {
    const words = name.trim().split(/\s+/).filter((w) => !FILLER.test(w));
    if (!words.length || out.some((o) => o.phone === phone)) return;
    out.push({ name: words.join(" "), phone });
  };
  const patterns = [
    new RegExp(String.raw`${NAME}'s\s+(?:phone\s+|cell\s+)?(?:number|phone|cell)\s*(?:is|=|:)?\s*${PHONE}`, "g"),
    new RegExp(String.raw`(?:number|phone|cell)\s+for\s+${NAME}\s*(?:is|=|:)?\s*${PHONE}`, "g"),
    new RegExp(String.raw`${NAME}\s*(?:is|=|:|-|,)?\s*(?:at\s+)?${PHONE}`, "g"),
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) add(m[1]!, m[2]!);
  return out;
}
