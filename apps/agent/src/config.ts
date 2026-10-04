import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Loads apps/agent/.env without a dependency. Real env vars win. */
function loadDotEnv() {
  const path = resolve(import.meta.dirname, "../.env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv();

const env = (key: string, fallback = "") => process.env[key]?.trim() || fallback;

export const config = {
  agentName: env("AGENT_NAME", "Rendezvous"),
  port: Number(env("PORT", "8787")),

  spectrumProjectId: env("SPECTRUM_PROJECT_ID"),
  spectrumProjectSecret: env("SPECTRUM_PROJECT_SECRET"),

  xaiApiKey: env("XAI_API_KEY"),
  grokModel: env("GROK_MODEL", "grok-4.20-0309-non-reasoning"),

  nessieApiKey: env("NESSIE_API_KEY"),
  nessieBaseUrl: env("NESSIE_BASE_URL", "https://api.nessieisreal.com"),

  googleMapsApiKey: env("GOOGLE_MAPS_API_KEY"),
  /** Path to a service account JSON. Members share free/busy with its email. */
  googleServiceAccountFile: env("GOOGLE_SERVICE_ACCOUNT_FILE"),

  bridgeUrl: env("BRIDGE_URL", "http://localhost:8765"),
  bridgeSecret: env("BRIDGE_SECRET", "dev-secret"),
  /** Every venue call dials this number instead of the restaurant. Leave set for the demo. */
  demoHostPhone: env("DEMO_HOST_PHONE"),
  /** Hidden chat command that sends departure DMs immediately. */
  fastForwardCommand: env("FAST_FORWARD_COMMAND", "!go"),

  membersFile: resolve(import.meta.dirname, "..", env("MEMBERS_FILE", "data/members.json")),
  /** Each organizer's saved contacts and groups. */
  contactsFile: resolve(import.meta.dirname, "..", env("CONTACTS_FILE", "data/contacts.json")),
  merchantsFile: resolve(import.meta.dirname, "../data/merchants.json"),
};

export type Config = typeof config;
