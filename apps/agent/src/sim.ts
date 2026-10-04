import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { RendezvousEngine, type BookingDetails, type Member, type Plan } from "@rendezvous/core";
import { config } from "./config.ts";
import { makePorts, startBridgeCall } from "./ports.ts";
import { loadRoster, memberFor } from "./roster.ts";
import { activeCalls, startServer } from "./server.ts";
import exampleRoster from "../data/members.example.json" with { type: "json" };

/**
 * Terminal group chat for testing without Photon. Uses the real Grok, Nessie
 * and Maps clients when keys are set, and fakes the venue call unless
 * SIM_BRIDGE=1 (then the Python bridge's "simulate" mode places it).
 *
 *   maya: too far, somewhere in Collegetown     message from Maya
 *   👍 maya                                      Maya taps 👍 on the latest message that wants one
 *   👍 all                                       everyone taps 👍
 *   /go                                          send departure DMs now
 */

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const roster = loadRoster().length ? loadRoster() : exampleRoster;
const members: Member[] = roster.map((r) => memberFor(r.handle, roster));
const byName = (name: string) => members.find((m) => m.name.toLowerCase().startsWith(name.toLowerCase()));

const sent: Array<{ id: string; text: string }> = [];
let engine!: RendezvousEngine;

async function fakeCall(_plan: Plan, d: BookingDetails) {
  setTimeout(async () => {
    console.log(dim(`  ☎ ${d.venue.name} host: "We can do ${d.partySize}. Booth or the high-top by the window?"`));
    const r = await engine.askGroup("Booth or the high-top by the window?", ["Booth", "High-top by the window"]);
    console.log(dim(`  ☎ ${config.agentName}: "${r.answer ?? "Either is fine"}, please."`));
    await engine.onCallResult({ status: "booked", notes: r.answer ? `${r.answer}, under ${d.reservationName}` : undefined });
    rl.prompt();
  }, 1200);
  return { callSid: "SIM" };
}

const useBridge = process.env.SIM_BRIDGE === "1";
if (useBridge) startServer();

const ports = makePorts(
  {
    send: async (text) => {
      const id = randomUUID();
      sent.push({ id, text });
      console.log(`\n${blue(`${config.agentName}:`)} ${text.replaceAll("\n", "\n  ")}\n`);
      return id;
    },
    dm: async (m, text) => {
      console.log(`\n${green(`DM → ${m.name}:`)} ${text.replaceAll("\n", "\n  ")}\n`);
      return true;
    },
  },
  useBridge
    ? async (plan, d) => {
        const token = randomUUID();
        activeCalls.set(token, engine);
        // The bridge's simulate mode plays the host instead of dialing anyone.
        config.demoHostPhone ||= "simulate";
        return startBridgeCall(token)(plan, d);
      }
    : fakeCall,
);
ports.log = (event, data) => {
  if (event.endsWith("failed")) console.log(dim(`  ! ${event}: ${data}`));
};
engine = new RendezvousEngine({ chatId: "sim", members, organizerId: members[0]!.id }, ports, { agentName: config.agentName });

console.log(`Group: ${members.map((m) => m.name).join(", ")}`);
console.log(dim(`Try: ${members[0]!.name.toLowerCase()}: @${config.agentName} dinner tonight, under $15 each`));
console.log(dim(`Grok ${config.xaiApiKey ? "on" : "off (built-in parser)"} · Nessie ${config.nessieApiKey ? "on" : "off (mock ledger)"} · Maps ${config.googleMapsApiKey ? "on" : "off (estimates)"}`));

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
rl.prompt();

/** The newest message a 👍 from this member would mean something on. */
function likeTarget(m: Member): string | undefined {
  const own = engine.split?.lines.find((l) => l.memberId === m.id && !l.confirmed)?.messageId;
  if (own) return own;
  return engine.plan?.proposalMessageId ?? sent.at(-1)?.id;
}

for await (const line of rl) {
  const text = line.trim();
  if (!text) {
    rl.prompt();
    continue;
  }
  if (text === "/quit") break;
  if (text === "/go") await engine.fastForwardDepartures();
  else if (text.startsWith("👍")) {
    const who = text.slice(2).trim();
    const targets = who === "all" ? members : [byName(who)].filter(Boolean) as Member[];
    if (!targets.length) console.log(dim("  who? e.g. 👍 maya"));
    for (const m of targets) {
      // A pending call question takes a 👍 on the question itself.
      const id = engine.phase === "booking" ? sent.at(-1)!.id : likeTarget(m);
      if (id) await engine.onReaction({ messageId: id, senderId: m.id, kind: "like" });
    }
  } else {
    const m = text.match(/^(\w+):\s*(.+)$/);
    const sender = m && byName(m[1]!);
    if (!sender) console.log(dim("  format: name: message"));
    else await engine.onMessage({ id: randomUUID(), senderId: sender.id, text: m![2]! });
  }
  rl.prompt();
}
process.exit(0);
