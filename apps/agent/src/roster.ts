import { existsSync, readFileSync } from "node:fs";
import { resolvePlace, type Member } from "@rendezvous/core";
import { config } from "./config.ts";

export interface RosterEntry {
  name: string;
  handle: string;
  nessieAccountId?: string;
  calendarId?: string;
  /** Where they usually are, e.g. "North Campus". Overridden by anything they say in chat. */
  usualPlace?: string;
}

export function normalizeHandle(handle: string): string {
  const h = handle.trim().toLowerCase();
  if (h.includes("@")) return h;
  const digits = h.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function loadRoster(): RosterEntry[] {
  if (!existsSync(config.membersFile)) return [];
  return JSON.parse(readFileSync(config.membersFile, "utf8")) as RosterEntry[];
}

/** Builds a Member from a chat handle, filling in what the roster knows about them. */
export function memberFor(handle: string, roster: RosterEntry[]): Member {
  const id = normalizeHandle(handle);
  const entry = roster.find((r) => normalizeHandle(r.handle) === id);
  const fallbackName = id.includes("@") ? id.split("@")[0]! : `Friend ${id.slice(-4)}`;
  return {
    id,
    handle: id,
    name: entry?.name ?? fallbackName,
    nessieAccountId: entry?.nessieAccountId,
    calendarId: entry?.calendarId,
    location: entry?.usualPlace ? resolvePlace(entry.usualPlace) : undefined,
  };
}
