import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { estimateWalkMinutes, type Interval, type LatLng, type Member } from "@rendezvous/core";
import { config } from "./config.ts";

// ───────────────────────── Calendar free/busy ─────────────────────────

/**
 * Free/busy only. Each member shares "See only free/busy" with the service
 * account's email, so event titles and attendees never reach the agent.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expires: number } | undefined;

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string | undefined> {
  if (!config.googleServiceAccountFile || !existsSync(config.googleServiceAccountFile)) return undefined;
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const sa = JSON.parse(readFileSync(config.googleServiceAccountFile, "utf8")) as ServiceAccount;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/calendar.freebusy",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

/** Returns busy intervals for members with a linked calendar; others are left out (treated as free). */
export async function freeBusy(members: Member[], window: Interval): Promise<Record<string, Interval[]>> {
  const linked = members.filter((m) => m.calendarId);
  if (!linked.length) return {};
  const token = await accessToken().catch((err) => {
    console.warn("calendar auth failed, treating everyone as free:", String(err));
    return undefined;
  });
  if (!token) return {};
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: window.start.toISOString(),
      // Cover the meal after the last possible start.
      timeMax: new Date(window.end.getTime() + 3 * 3600_000).toISOString(),
      timeZone: "America/New_York",
      items: linked.map((m) => ({ id: m.calendarId })),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.warn("freeBusy failed, treating everyone as free:", res.status);
    return {};
  }
  const body = (await res.json()) as { calendars: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> };
  const out: Record<string, Interval[]> = {};
  for (const m of linked) {
    const cal = body.calendars[m.calendarId!];
    // A calendar that errored (not shared) counts as unlinked, so it's flagged as assumed free.
    if (!cal || cal.errors?.length) continue;
    out[m.id] = (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }
  return out;
}

// ───────────────────────── Walking times ─────────────────────────

const travelCache = new Map<string, number>();
const key = (a: LatLng, b: LatLng) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

/**
 * Walking minutes from the Routes API. Routes ignores arrivalTime for walking,
 * so the agent subtracts this duration from the reservation time itself.
 * Falls back to an offline estimate if Maps is unavailable.
 */
export async function walkingMinutes(from: LatLng, to: LatLng): Promise<number> {
  const k = key(from, to);
  const hit = travelCache.get(k);
  if (hit !== undefined) return hit;
  let minutes = estimateWalkMinutes(from, to);
  if (config.googleMapsApiKey) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.googleMapsApiKey,
          "X-Goog-FieldMask": "routes.duration",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: "WALK",
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const body = (await res.json()) as { routes?: Array<{ duration: string }> };
        const seconds = Number.parseInt(body.routes?.[0]?.duration ?? "", 10);
        if (Number.isFinite(seconds)) minutes = Math.max(1, Math.ceil(seconds / 60));
      } else {
        console.warn("Routes API", res.status, (await res.text()).slice(0, 160));
      }
    } catch (err) {
      console.warn("Routes API failed, using estimate:", String(err));
    }
  }
  travelCache.set(k, minutes);
  return minutes;
}
