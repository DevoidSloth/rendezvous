import { randomUUID } from "node:crypto";
import { Spectrum, cloud } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { RendezvousEngine, isMention, parseActivity, type IncomingMessage, type IncomingReaction, type Member } from "@rendezvous/core";
import { config } from "./config.ts";
import { callLineReady, makePorts, startBridgeCall } from "./ports.ts";
import { loadRoster, memberFor, normalizeHandle } from "./roster.ts";
import { AddressBook, contactPairs, parseBookCommand, type BookCommand, type Contact } from "./addressBook.ts";
import { parseInvites, toE164, unknownNames, withoutPhones, type Invite } from "./invites.ts";
import { routeMessage, type RouteContext, type Routed } from "./understand.ts";
import { createAccount, createCustomer, nessieEnabled } from "./nessie.ts";
import { ensureUser, listUsers, type PhotonUser } from "./photonUsers.ts";
import { RelayGroup } from "./relay.ts";
import { activeCalls, startServer } from "./server.ts";

/**
 * Rendezvous on Photon (Spectrum, Stable docs).
 *
 * 1:1 plans (any line): the organizer texts the agent with what they want to
 * do and who's coming ("@Rendezvous dinner tonight with Sandy 561-555-0100").
 * The agent registers each invitee as a Photon user if needed, texts them 1:1
 * and runs the plan across those threads: it relays each person's messages to
 * the others and sends its own to everyone. A 👍 in any thread counts. This is
 * the only way to plan on a Free/Pro shared-pool line, which can't carry group
 * chats and routes each person through their own assigned number.
 *
 * Group chats (Business dedicated line): iMessage groups arrive as
 * `type: "group"` spaces and get one engine per group.
 */

const TAPBACKS: Record<string, IncomingReaction["kind"]> = {
  "👍": "like",
  "👎": "dislike",
  "❤️": "love",
  "😂": "laugh",
  "‼️": "emphasize",
  "❓": "question",
};

if (!config.spectrumProjectId || !config.spectrumProjectSecret) {
  console.error("Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET (app.photon.codes → Settings). For a local run without Photon, use `npm run sim`.");
  process.exit(1);
}

const app = await Spectrum({
  projectId: config.spectrumProjectId,
  projectSecret: config.spectrumProjectSecret,
  providers: [imessage.config()],
});
const im = imessage(app);
const roster = loadRoster();

async function detectLine(): Promise<"shared" | "dedicated" | "unknown"> {
  try {
    const tokens = await cloud.issueImessageTokens(config.spectrumProjectId, config.spectrumProjectSecret);
    return "type" in tokens && tokens.type === "shared" ? "shared" : "dedicated";
  } catch (err) {
    console.warn("couldn't detect the iMessage line type", String(err));
    return "unknown";
  }
}

const line = await detectLine();
callLineReady();
console.log(
  `iMessage line: ${line}. ${line === "shared" ? "Group chats can't reach a shared line, so plans run over 1:1 texts." : "Group chats and 1:1 plans both work."}`,
);

interface Chat {
  engine: RendezvousEngine;
  queue: Promise<unknown>;
}

function enqueue(chat: { queue: Promise<unknown> }, fn: () => Promise<void>) {
  chat.queue = chat.queue.then(fn).catch((err) => console.error("handler failed", err));
  return chat.queue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpace = any;

/** 1:1 threads by member id, so DMs and relay sends reuse the same space. */
const dmSpaces = new Map<string, AnySpace>();

async function dmSpace(member: Member): Promise<AnySpace> {
  // A thread someone opened (or the relay registered) wins over creating a new one.
  let space = dmSpaces.get(member.id);
  if (!space) {
    space = await im.space.create(await im.user(member.handle));
    dmSpaces.set(member.id, space);
  }
  return space;
}

async function dm(member: Member, text: string): Promise<boolean> {
  try {
    await (await dmSpace(member)).send(text);
    return true;
  } catch (err) {
    console.warn(`DM to ${member.name} failed`, String(err));
    return false;
  }
}

function makeEngine(chatId: string, members: Member[], send: (text: string) => Promise<string>, engineRef: { engine?: RendezvousEngine }) {
  const ports = makePorts({ send, dm }, async (plan, details) => {
    const token = randomUUID();
    activeCalls.set(token, engineRef.engine!);
    return startBridgeCall(token)(plan, details);
  });
  const engine = new RendezvousEngine({ chatId, members, organizerId: members[0]?.id ?? "" }, ports, { agentName: config.agentName, canCall: callLineReady });
  engineRef.engine = engine;
  return engine;
}

// ───────────────────────── native groups ─────────────────────────

const groups = new Map<string, Chat>();

async function groupFor(space: AnySpace, senderHandle: string): Promise<Chat> {
  const existing = groups.get(space.id);
  if (existing) {
    const id = normalizeHandle(senderHandle);
    if (!existing.engine.group.members.some((m) => m.id === id)) existing.engine.group.members.push(memberFor(senderHandle, roster));
    return existing;
  }
  const handles = new Set<string>([normalizeHandle(senderHandle)]);
  try {
    for (const u of await space.getMembers()) handles.add(normalizeHandle(u.id));
  } catch (err) {
    console.warn("getMembers failed", String(err));
  }
  // If the participant list didn't come through, plan for the roster rather than a party of one.
  if (handles.size < 2) for (const r of roster) handles.add(normalizeHandle(r.handle));
  const members = [...handles].map((h) => memberFor(h, roster));
  const ref: { engine?: RendezvousEngine } = {};
  const engine = makeEngine(
    space.id,
    members,
    async (text) => {
      const msg = await space.send(text);
      return msg?.id ?? randomUUID();
    },
    ref,
  );
  const chat = { engine, queue: Promise.resolve() as Promise<unknown> };
  groups.set(space.id, chat);
  console.log(`joined group ${space.id} with ${members.map((m) => m.name).join(", ")}`);
  return chat;
}

// ───────────────────────── relay group ─────────────────────────

// One relay group per organizer; each person is in at most one at a time.
const relayOf = new Map<string, RelayGroup>();

function newRelay(organizer: Member, thread: AnySpace): RelayGroup {
  const group = new RelayGroup(
    [organizer],
    dmSpace,
    (members, send) => makeEngine(`relay:${organizer.id}`, members, send, {}),
    config.agentName,
    (member, t) => dmSpaces.set(member.id, t),
  );
  dmSpaces.set(organizer.id, thread);
  relayOf.set(organizer.id, group);
  return group;
}

let usersCache: { at: number; users: PhotonUser[] } | undefined;
async function photonUsers(): Promise<PhotonUser[]> {
  if (usersCache && Date.now() - usersCache.at < 60_000) return usersCache.users;
  const users = await listUsers().catch((err) => (console.warn("list users failed", String(err)), [] as PhotonUser[]));
  usersCache = { at: Date.now(), users };
  return users;
}

async function personFor(handle: string): Promise<Member> {
  const m = memberFor(handle, roster);
  if (m.name.startsWith("Friend ")) {
    const u = (await photonUsers()).find((x) => normalizeHandle(x.phoneNumber) === m.id);
    if (u?.firstName) m.name = u.firstName;
  }
  return m;
}

/** Gives a guest a Nessie checking account so their share of the bill can be paid. */
async function ensureAccount(member: Member) {
  if (member.nessieAccountId || !nessieEnabled()) return;
  try {
    member.nessieAccountId = await createAccount(await createCustomer(member.name, "Guest"), `${member.name}'s checking`, 40);
  } catch (err) {
    console.warn(`Nessie account for ${member.name} failed`, String(err));
  }
}

const book = new AddressBook(config.contactsFile);

const prettyPhone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
};

/** Names this organizer can use without a number: their contacts first, then the roster and Photon users. */
async function knownPeople(owner: string): Promise<Contact[]> {
  const users = await photonUsers();
  return [
    ...book.contacts(owner),
    ...roster.map((r) => ({ name: r.name.split(" ")[0]!, phone: normalizeHandle(r.handle) })),
    ...users.filter((u) => u.firstName).map((u) => ({ name: u.firstName, phone: normalizeHandle(u.phoneNumber) })),
  ];
}

interface Resolved {
  people: Contact[];
  saved: string[];
  unknown: string[];
}

/**
 * Turns invitees (names and/or numbers) and saved group names into people
 * with numbers, saving any new name/number pairs to the organizer's contacts.
 */
async function resolveInvites(owner: string, invites: Invite[], groupNames: string[]): Promise<Resolved> {
  const known = await knownPeople(owner);
  const out: Resolved = { people: [], saved: [], unknown: [] };
  const push = (c: Contact) => {
    if (!out.people.some((p) => p.phone === c.phone)) out.people.push(c);
  };
  for (const name of groupNames) {
    const g = book.group(owner, name);
    if (g) for (const phone of g.members) push({ name: book.nameFor(owner, phone) ?? "Friend", phone });
  }
  for (const inv of invites) {
    if (inv.phone) {
      const name = inv.name ?? book.nameFor(owner, inv.phone) ?? "Friend";
      if (inv.name && book.saveContact(owner, inv.name, inv.phone)) out.saved.push(inv.name);
      push({ name: inv.name ? book.contact(owner, inv.name)?.name ?? name : name, phone: inv.phone });
    } else if (inv.name) {
      const hit = known.find((k) => k.name.toLowerCase() === inv.name!.toLowerCase());
      if (hit) push({ name: hit.name, phone: hit.phone });
      else if (!book.group(owner, inv.name)) out.unknown.push(inv.name);
    }
  }
  return out;
}

/** The same, read straight from text with the built-in parsers (used when Grok is unavailable). */
async function resolvePeople(owner: string, text: string): Promise<Resolved> {
  const known = await knownPeople(owner);
  const groupsHere = book.groupsIn(owner, text);
  const groupWords = groupsHere.flatMap((g) => g.name.toLowerCase().split(" "));
  const invites = parseInvites(text, known.map((k) => k.name)).filter((i) => i.phone || !groupWords.includes(i.name!.toLowerCase()));
  const resolved = await resolveInvites(owner, invites, groupsHere.map((g) => g.name));
  const named = [...known.map((k) => k.name), ...resolved.people.map((p) => p.name)];
  resolved.unknown.push(...unknownNames(text, named, groupWords));
  return resolved;
}

/**
 * People invited who couldn't be texted yet. A shared line can't start a
 * conversation with someone who has never texted it, so they say hi first
 * and are added to the plan they were invited to.
 */
const pendingInvites = new Map<string, { group: RelayGroup; name: string; inviter: Member }>();

/** Brings resolved people into the plan, registering anyone new with Photon. Returns a note for the organizer. */
async function addInvitees(group: RelayGroup, organizer: Member, resolved: Resolved): Promise<string | undefined> {
  const { people, saved, unknown } = resolved;
  const problems: string[] = [];
  const waiting: string[] = [];
  for (const person of people) {
    const id = person.phone;
    if (id === organizer.id || group.member(id)) continue;
    let user: PhotonUser | undefined;
    try {
      user = await ensureUser(id, person.name);
      usersCache = undefined;
      const member = await personFor(id);
      member.name = person.name !== "Friend" ? person.name : user.firstName || member.name;
      // Someone can only be in one plan at a time.
      const previous = relayOf.get(id);
      if (previous && previous !== group) await previous.leave(member);
      await ensureAccount(member);
      await group.invite(member, await dmSpace(member), organizer);
      relayOf.set(id, group);
      pendingInvites.delete(id);
    } catch (err) {
      console.warn(`invite ${person.name} failed`, String(err));
      if (/not allowed/i.test(String(err)) && user?.assignedPhoneNumber) {
        pendingInvites.set(id, { group, name: person.name === "Friend" ? user.firstName || "Friend" : person.name, inviter: organizer });
        waiting.push(`${person.name} needs to text "hi" to ${prettyPhone(user.assignedPhoneNumber)} once, then I'll add them`);
      } else {
        problems.push(person.name);
      }
    }
  }
  const notes: string[] = [];
  if (saved.length) notes.push(`Saved ${saved.join(" and ")} to your contacts.`);
  if (unknown.length) notes.push(`I don't have a number for ${unknown.join(" or ")}. Send it like "add ${unknown[0]} 561-555-0100".`);
  if (waiting.length) notes.push(`${waiting.join(". ")}. That's their own number for ${config.agentName}.`);
  if (problems.length) notes.push(`I couldn't reach ${problems.join(" and ")}. Check the number and try again.`);
  return notes.length ? notes.join(" ") : undefined;
}

/** Contacts and saved groups: "save Sandy 561-317-2754", "save group Roommates: Sandy, Maya", "contacts". */
async function handleBookCommand(cmd: BookCommand, owner: Member, space: AnySpace) {
  const ownerId = owner.id;
  switch (cmd.kind) {
    case "saveContact": {
      const phone = toE164(cmd.phone);
      const changed = book.saveContact(ownerId, cmd.name, phone);
      const name = book.contact(ownerId, cmd.name)!.name;
      await space.send(`${changed ? "Saved" : "Already have"} ${name}, ${prettyPhone(phone)}. Now you can just say "dinner tonight with ${name}".`);
      return;
    }
    case "saveGroup": {
      const { people, unknown } = await resolvePeople(ownerId, `with ${cmd.list}`);
      if (!people.length) {
        await space.send(`I couldn't find anyone in that list. Try "save group ${cmd.name}: Sandy 561-555-0100, Maya 607-555-0102".`);
        return;
      }
      book.saveGroup(ownerId, cmd.name, people.map((p) => p.phone));
      const g = book.group(ownerId, cmd.name)!;
      const missing = unknown.length ? ` I left out ${unknown.join(" and ")} since I don't have a number.` : "";
      await space.send(`Saved ${g.name}: ${people.map((p) => p.name).join(", ")}. Try "dinner tonight with ${g.name}".${missing}`);
      return;
    }
    case "saveCurrentGroup": {
      const group = relayOf.get(ownerId);
      const others = group?.members.filter((m) => m.id !== ownerId) ?? [];
      if (!others.length) {
        await space.send("There's no one in your current plan yet. Start one first, like \"dinner tonight with Sandy 561-555-0100\".");
        return;
      }
      for (const m of others) if (!m.name.startsWith("Friend ")) book.saveContact(ownerId, m.name, m.id);
      book.saveGroup(ownerId, cmd.name, others.map((m) => m.id));
      await space.send(`Saved ${book.group(ownerId, cmd.name)!.name}: ${others.map((m) => m.name).join(", ")}.`);
      return;
    }
    case "listContacts": {
      const list = book.contacts(ownerId);
      await space.send(list.length ? `Your contacts:\n${list.map((c) => `${c.name}, ${prettyPhone(c.phone)}`).join("\n")}` : `No contacts yet. Save one with "save Sandy 561-555-0100", or just include a number when you plan.`);
      return;
    }
    case "listGroups": {
      const list = book.groups(ownerId);
      await space.send(
        list.length
          ? `Your groups:\n${list.map((g) => `${g.name}: ${g.members.map((p) => book.nameFor(ownerId, p) ?? prettyPhone(p)).join(", ")}`).join("\n")}`
          : `No groups yet. Make one with "save group Roommates: Sandy, Maya", or "save this group as Roommates" during a plan.`,
      );
      return;
    }
    case "forget": {
      const what = book.forget(ownerId, cmd.name);
      await space.send(what ? `Forgot the ${what} ${cmd.name}.` : `I don't have a contact or group called ${cmd.name}.`);
      return;
    }
  }
}

/** "dinner tonight with Sandy", "grab lunch tomorrow?" — a plan request without the @. */
function looksLikeRequest(text: string): boolean {
  return parseActivity(text) !== undefined || /\b(plan|meet ?up|hang ?out|get together)\b/i.test(text);
}

/** "add Sandy", "invite Maya", "with the roommates", or a bare phone number. */
function mentionsInvite(text: string, owner: string): boolean {
  return /\b(add|invite)\b/i.test(text) || withoutPhones(text) !== text.trim() || book.groupsIn(owner, text).length > 0;
}

// ───────────────────────── Grok-routed 1:1 messages ─────────────────────────

async function routeContext(senderId: string, group: RelayGroup | undefined): Promise<RouteContext> {
  const engine = group?.engine;
  return {
    agentName: config.agentName,
    now: new Date(),
    senderName: (await personFor(senderId)).name,
    phase: engine?.phase ?? "none",
    isOrganizer: engine ? engine.group.organizerId === senderId : true,
    openQuestion: engine?.openQuestion ?? null,
    members: group?.members.map((m) => m.name) ?? [],
    contacts: book.contacts(senderId).map((c) => c.name),
    groups: book.groups(senderId).map((g) => g.name),
    hasUnpaidShare: engine?.split?.lines.some((l) => l.memberId === senderId && !l.confirmed) ?? false,
  };
}

interface Inbound {
  text: string;
  sender: string;
  senderId: string;
  space: AnySpace;
  group: RelayGroup | undefined;
  messageId: string;
}

/** Acts on what Grok understood. Every branch ends in a reply or an engine step, never silence. */
async function handleRouted(r: Routed, m: Inbound) {
  const { senderId, space } = m;
  // Any name/number pair in any message is worth remembering.
  const savedNow: string[] = [];
  for (const c of r.contacts) if (book.saveContact(senderId, c.name, c.phone)) savedNow.push(book.contact(senderId, c.name)!.name);

  switch (r.intent) {
    case "save_contacts": {
      if (!r.contacts.length) {
        await space.send(`I didn't catch a full phone number. Send it like "Sandy 561-555-0100".`);
        return;
      }
      const lines = r.contacts.map((c) => `${savedNow.includes(book.contact(senderId, c.name)!.name) ? "Saved" : "Already have"} ${book.contact(senderId, c.name)!.name}, ${prettyPhone(c.phone)}.`);
      await space.send(`${lines.join("\n")}\nNow you can just say "dinner tonight with ${book.contact(senderId, r.contacts[0]!.name)!.name}".`);
      return;
    }
    case "save_group": {
      const name = r.group_name ?? "My group";
      const resolved = await resolveInvites(senderId, r.people, r.groups);
      if (!resolved.people.length) {
        await space.send(`Who's in ${name}? Send names and numbers, like "${name}: Sandy 561-555-0100, Maya 607-555-0102".`);
        return;
      }
      book.saveGroup(senderId, name, resolved.people.map((p) => p.phone));
      const missing = resolved.unknown.length ? ` I left out ${resolved.unknown.join(" and ")} since I don't have a number.` : "";
      await space.send(`Saved ${book.group(senderId, name)!.name}: ${resolved.people.map((p) => p.name).join(", ")}. Try "dinner tonight with ${book.group(senderId, name)!.name}".${missing}`);
      return;
    }
    case "save_current_group":
      return handleBookCommand({ kind: "saveCurrentGroup", name: r.group_name ?? "My group" }, await personFor(senderId), space);
    case "list_contacts":
      return handleBookCommand({ kind: "listContacts" }, await personFor(senderId), space);
    case "list_groups":
      return handleBookCommand({ kind: "listGroups" }, await personFor(senderId), space);
    case "forget":
      if (r.forget_name) return handleBookCommand({ kind: "forget", name: r.forget_name }, await personFor(senderId), space);
      await space.send("Who should I forget? Send their name.");
      return;
    case "leave": {
      if (m.group) {
        const g = m.group;
        const member = g.member(senderId)!;
        relayOf.delete(senderId);
        void enqueue(g, () => g.leave(member));
      }
      await space.send("You're out. Text me anytime to start a new plan.");
      return;
    }
    case "start_plan": {
      const g = m.group ?? newRelay(await personFor(m.sender), space);
      if (!m.group) void ensureAccount(g.members[0]!);
      const member = g.member(senderId)!;
      const request = r.plan_text ?? withoutPhones(m.text);
      void enqueue(g, async () => {
        if (r.people.length || r.groups.length) {
          const note = await addInvitees(g, member, await resolveInvites(senderId, r.people, r.groups));
          if (note) await space.send(note);
        }
        await app.responding(space, () => g.onText(member, m.messageId, withoutPhones(m.text), request, "plan"));
      });
      return;
    }
    case "add_people": {
      const g = m.group;
      if (!g) {
        await space.send(`What should I plan with them? Something like "dinner tonight with ${r.people[0]?.name ?? "Sandy"}".`);
        return;
      }
      const member = g.member(senderId)!;
      if (g.engine.group.organizerId !== senderId) {
        await space.send(`Only ${g.engine.organizer.name} can add people to this plan.`);
        return;
      }
      void enqueue(g, async () => {
        const note = await addInvitees(g, member, await resolveInvites(senderId, r.people, r.groups));
        if (note) await space.send(note);
      });
      return;
    }
    default: {
      const g = m.group;
      if (!g) {
        await space.send(r.reply ?? HELP);
        return;
      }
      const member = g.member(senderId)!;
      // Restate what Grok understood in the words the engine's parsers expect.
      const forEngine: Record<string, [string, IncomingMessage["kind"]]> = {
        approve: ["yes", "approve"],
        change_plan: [r.change_text ?? m.text, "counter"],
        choose_option: [r.choice ? String(r.choice) : m.text, "other"],
        paid: [r.amount !== null ? `I paid $${r.amount}` : m.text, "other"],
        adjust_split: [
          r.adjust_name && r.amount !== null ? (r.amount >= 0 ? `${r.adjust_name} add $${r.amount}` : `take off $${-r.amount} from ${r.adjust_name}`) : m.text,
          "other",
        ],
        chat: [m.text, "other"],
      };
      const [text, kind] = forEngine[r.intent] ?? [m.text, "other"];
      void enqueue(g, () => app.responding(space, () => g.onText(member, m.messageId, withoutPhones(m.text), text, kind)));
      return;
    }
  }
}

const HELP = [
  "Text me what you want to do and who's coming, like:",
  "dinner tonight under $15 with Sandy 561-555-0100",
  "I'll text each person, find a spot that's fair to everyone's walk, and keep everyone in the loop here.",
  `I'll remember Sandy's number for next time. You can save groups too: "save group Roommates: Sandy, Maya".`,
].join("\n");

// ───────────────────────── inbound ─────────────────────────

startServer();
console.log(`${config.agentName} is listening on iMessage`);

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound" || message.platform !== "imessage") continue;
  const sender = message.sender?.id;
  if (!sender) continue;
  const narrowed = imessage(space);
  const content = message.content;
  const senderId = normalizeHandle(sender);
  // One line per inbound event, so you can see what Photon delivers (no message text logged).
  console.log(`[in] ${narrowed.type} ${space.id} from …${sender.slice(-4)}: ${content.type}`);

  // Native group chat (dedicated line).
  if (narrowed.type === "group") {
    const chat = await groupFor(space, sender);
    const engine = chat.engine;
    if (content.type === "text") {
      const text = content.text;
      if (text.trim() === config.fastForwardCommand) void enqueue(chat, () => engine.fastForwardDepartures());
      else void enqueue(chat, () => app.responding(space, () => engine.onMessage({ id: message.id, senderId, text })));
    } else if (content.type === "reaction") {
      const kind = TAPBACKS[content.emoji];
      if (kind) void enqueue(chat, () => engine.onReaction({ messageId: content.target.id, senderId, kind }));
    } else if (content.type === "addMember") {
      for (const h of content.members) {
        if (!engine.group.members.some((m) => m.id === normalizeHandle(h))) engine.group.members.push(memberFor(h, roster));
      }
    } else if (content.type === "removeMember" || content.type === "leaveSpace") {
      const gone = new Set(content.type === "removeMember" ? content.members.map(normalizeHandle) : [senderId]);
      engine.group.members = engine.group.members.filter((m) => !gone.has(m.id));
    }
    continue;
  }

  // 1:1 thread.
  dmSpaces.set(senderId, space);
  const text = content.type === "text" ? content.text.trim() : "";
  let group = relayOf.get(senderId);

  if (content.type === "reaction") {
    const kind = TAPBACKS[content.emoji];
    if (group && kind) {
      const g = group;
      void enqueue(g, () => g.engine.onReaction({ messageId: g.logicalId(content.target.id), senderId, kind }));
    }
    continue;
  }
  if (content.type !== "text" || !text) continue;

  if (/^(stop|leave|quit)$/i.test(text)) {
    if (group) {
      const g = group;
      const member = g.member(senderId)!;
      relayOf.delete(senderId);
      void enqueue(g, () => g.leave(member));
    }
    await space.send("You're out. Text me anytime to start a new plan.");
    continue;
  }

  // Someone who was invited before they could be texted has now said hi.
  const pending = !group ? pendingInvites.get(senderId) : undefined;
  if (pending) {
    pendingInvites.delete(senderId);
    const member = await personFor(sender);
    member.name = pending.name;
    await ensureAccount(member);
    const g = pending.group;
    void enqueue(g, async () => {
      await g.invite(member, space, pending.inviter);
      relayOf.set(senderId, g);
    });
    continue;
  }

  if (text !== config.fastForwardCommand) {
    const routed = await routeMessage(text, await routeContext(senderId, group));
    if (routed) {
      await handleRouted(routed, { text, sender, senderId, space, group, messageId: message.id });
      continue;
    }
  }

  const bookCommand = parseBookCommand(text);
  if (bookCommand) {
    await handleBookCommand(bookCommand, group?.member(senderId) ?? (await personFor(sender)), space);
    continue;
  }

  // Everything in a 1:1 thread is addressed to the agent, so no @ is needed.
  const planning = !group || group.engine.phase === "idle";
  const startsPlan = isMention(text, config.agentName) || (planning && looksLikeRequest(text));
  // Outside a plan, a name and number is a contact to save ("Sandy's number is 561…").
  const pairs = contactPairs(text);
  if (!startsPlan && pairs.length && (!group || group.engine.group.organizerId !== senderId || group.engine.phase === "idle")) {
    const lines = pairs.map(({ name, phone }) => {
      const e164 = toE164(phone);
      const changed = book.saveContact(senderId, name, e164);
      const saved = book.contact(senderId, name)!;
      return `${changed ? "Saved" : "Already have"} ${saved.name}, ${prettyPhone(e164)}.`;
    });
    const firstName = book.contact(senderId, pairs[0]!.name)!.name;
    await space.send(`${lines.join("\n")}\nNow you can just say "dinner tonight with ${firstName}".`);
    continue;
  }
  if (!group) {
    if (!startsPlan) {
      await space.send(HELP);
      continue;
    }
    group = newRelay(await personFor(sender), space);
    void ensureAccount(group.members[0]!);
  }
  const g = group;
  const member = g.member(senderId)!;
  if (text === config.fastForwardCommand) {
    void enqueue(g, () => g.engine.fastForwardDepartures());
    continue;
  }
  void enqueue(g, async () => {
    // Only the organizer adds people, so a guest can't pull in strangers.
    if (g.engine.group.organizerId === member.id && (startsPlan || mentionsInvite(text, member.id))) {
      const note = await addInvitees(g, member, await resolvePeople(member.id, text));
      if (note) await space.send(note);
    }
    // The engine starts plans on a mention; in a DM the request itself is enough.
    const forEngine = startsPlan && !isMention(text, config.agentName) ? `@${config.agentName} ${text}` : text;
    await app.responding(space, () => g.onText(member, message.id, withoutPhones(text), withoutPhones(forEngine)));
  });
}
