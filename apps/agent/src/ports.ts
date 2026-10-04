import { existsSync, readFileSync } from "node:fs";
import {
  ITHACA_VENUES,
  RealClock,
  formatDay,
  formatTime,
  type BookingDetails,
  type Clock,
  type Member,
  type Plan,
  type Ports,
  type Venue,
} from "@rendezvous/core";
import { config } from "./config.ts";
import { freeBusy, walkingMinutes } from "./google.ts";
import { grokUnderstandCounter, grokUnderstandRequest } from "./grok.ts";
import { getBalance, nessieEnabled, transfer } from "./nessie.ts";

/** Seeded venues with their Nessie merchant ids (written by `npm run seed`). */
export function loadVenues(): Venue[] {
  const ids: Record<string, string> = existsSync(config.merchantsFile) ? JSON.parse(readFileSync(config.merchantsFile, "utf8")) : {};
  return ITHACA_VENUES.map((v) => ({ ...v, merchantId: ids[v.id] }));
}

export interface ChatTransport {
  send(text: string): Promise<string>;
  dm(member: Member, text: string): Promise<boolean>;
}

/** Hands a venue call to the Python bridge. The bridge reports back on /bridge/*. */
export type CallStarter = (plan: Plan, details: BookingDetails) => Promise<{ callSid?: string }>;

export function startBridgeCall(callToken: string): CallStarter {
  return async (_plan, d) => {
    const to = config.demoHostPhone || d.venue.phone;
    if (!to) throw new Error(`No phone number for ${d.venue.name}; set DEMO_HOST_PHONE`);
    const res = await fetch(`${config.bridgeUrl}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Secret": config.bridgeSecret },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        call_token: callToken,
        to,
        venue_name: d.venue.name,
        time_text: `${formatTime(d.time)} ${formatDay(d.time)}`,
        party_size: d.partySize,
        reservation_name: d.reservationName,
        callback_number: d.callbackNumber,
        seating: d.seating ?? null,
        accessibility: d.accessibility ?? null,
      }),
    });
    if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { call_sid?: string };
    return { callSid: body.call_sid };
  };
}

export function makePorts(transport: ChatTransport, callVenue: CallStarter, clock: Clock = new RealClock()): Ports {
  const venues = loadVenues();
  return {
    now: () => clock.now(),
    schedule: (at, key, fn) => clock.schedule(at, key, fn),
    cancel: (key) => clock.cancel(key),
    send: (text) => transport.send(text),
    dm: (member, text) => transport.dm(member, text),
    venues: async () => venues,
    travel: (from, venue) => walkingMinutes(from, venue.location),
    busy: (members, window) => freeBusy(members, window),
    balances: async (members) => {
      const entries = await Promise.all(
        members.map(async (m) => [m.id, m.nessieAccountId ? await getBalance(m.nessieAccountId).catch(() => undefined) : undefined] as const),
      );
      return Object.fromEntries(entries);
    },
    callVenue,
    // Offline, the mock ledger keys accounts by member id.
    transfer: (from, to, amount, description) =>
      transfer(from.nessieAccountId || (nessieEnabled() ? "" : from.id), to.nessieAccountId || (nessieEnabled() ? "" : to.id), amount, description),
    understandRequest: grokUnderstandRequest,
    understandCounter: grokUnderstandCounter,
    log: (event, data) => console.log(`[engine] ${event}`, data ?? ""),
  };
}

/**
 * Whether a venue call can actually be placed: a number to dial and a bridge
 * that answers. Checked every minute so starting the bridge mid-session works.
 */
let bridgeUp = false;
let watching = false;

export function callLineReady(): boolean {
  if (!watching) {
    watching = true;
    const check = async () => {
      try {
        const res = await fetch(`${config.bridgeUrl}/health`, { signal: AbortSignal.timeout(3000) });
        bridgeUp = res.ok;
      } catch {
        bridgeUp = false;
      }
    };
    void check();
    setInterval(check, 60_000).unref();
  }
  return bridgeUp && Boolean(config.demoHostPhone);
}
