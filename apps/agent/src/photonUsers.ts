import { config } from "./config.ts";
import { normalizeHandle } from "./roster.ts";

/**
 * Spectrum API users (Stable docs: api-reference/introduction, cli/spectrum).
 * On a shared-pool line the agent can only text registered users, so
 * invitees are registered here before their first message. Each user is
 * routed through their own assigned number.
 */

export interface PhotonUser {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  assignedPhoneNumber?: string;
}

const base = () => `https://spectrum.photon.codes/projects/${config.spectrumProjectId}/users/`;
const auth = () => `Basic ${Buffer.from(`${config.spectrumProjectId}:${config.spectrumProjectSecret}`).toString("base64")}`;

export async function listUsers(): Promise<PhotonUser[]> {
  const res = await fetch(base(), { headers: { Authorization: auth() }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as { succeed: boolean; data?: { users: PhotonUser[] }; message?: string };
  if (!body.succeed || !body.data) throw new Error(`list users failed: ${body.message ?? res.status}`);
  return body.data.users;
}

/** Returns the registered user for this phone, creating one if needed. */
export async function ensureUser(phone: string, firstName: string): Promise<PhotonUser> {
  const id = normalizeHandle(phone);
  const existing = (await listUsers()).find((u) => normalizeHandle(u.phoneNumber) === id);
  if (existing) return existing;
  const res = await fetch(base(), {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      type: "shared",
      firstName,
      lastName: "Guest",
      // The API requires an email; guests don't give one, so this is a stable placeholder.
      email: `guest+${id.replace(/\D/g, "")}@tablefor.us`,
      phoneNumber: id,
    }),
  });
  const body = (await res.json()) as { succeed: boolean; data?: PhotonUser; message?: string };
  if (!body.succeed || !body.data) throw new Error(`register ${id} failed: ${body.message ?? res.status}`);
  return body.data;
}
