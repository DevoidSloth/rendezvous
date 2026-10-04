import { randomUUID } from "node:crypto";
import type { IncomingMessage, Member, RendezvousEngine } from "@rendezvous/core";
import { normalizeHandle } from "./roster.ts";

export interface Thread {
  send(text: string): Promise<{ id: string } | undefined>;
}

const first = (m: Member) => m.name.split(" ")[0]!;

/**
 * One group spread across 1:1 threads, for shared-pool Photon lines that
 * can't carry group chats. Each copy of an agent message has its own id per
 * thread; `copies` maps them back to one logical id, so a tapback in any
 * thread counts against the right message.
 */
export class RelayGroup {
  readonly copies = new Map<string, string>();
  readonly engine: RendezvousEngine;
  queue: Promise<unknown> = Promise.resolve();

  constructor(
    members: Member[],
    private thread: (member: Member) => Promise<Thread>,
    makeEngine: (members: Member[], send: (text: string) => Promise<string>) => RendezvousEngine,
    private agentName: string,
    private remember?: (member: Member, thread: Thread) => void,
  ) {
    this.engine = makeEngine(members, (text) => this.broadcast(text));
  }

  get members() {
    return this.engine.group.members;
  }

  member(handle: string): Member | undefined {
    const id = normalizeHandle(handle);
    return this.members.find((m) => m.id === id);
  }

  /** Sends to every member's thread (optionally skipping one) and returns one logical id. */
  async broadcast(text: string, exceptId?: string): Promise<string> {
    const logical = randomUUID();
    await Promise.all(
      this.members
        .filter((m) => m.id !== exceptId)
        .map(async (m) => {
          try {
            const msg = await (await this.thread(m)).send(text);
            if (msg?.id) this.copies.set(msg.id, logical);
          } catch (err) {
            console.warn(`relay to ${m.name} failed`, String(err));
          }
        }),
    );
    return logical;
  }

  /** Maps a tapback target in someone's thread back to the message the engine knows. */
  logicalId(messageId: string): string {
    return this.copies.get(messageId) ?? messageId;
  }

  async join(member: Member, thread: Thread) {
    this.members.push(member);
    this.remember?.(member, thread);
    if (!this.engine.group.organizerId) this.engine.group.organizerId = member.id;
    const others = this.members.filter((m) => m.id !== member.id).map(first);
    await thread.send(
      others.length
        ? `You're in the group with ${others.join(", ")}. Everything you send here goes to them too. Text me what you want to do to start a plan.`
        : `You're in. Have your friends text this number too, then tell me what you want to do.`,
    );
    if (others.length) await this.broadcast(`${first(member)} joined the group.`, member.id);
  }

  /** The organizer added someone. They get an intro in their own thread; the others are told. */
  async invite(member: Member, thread: Thread, inviter: Member) {
    if (this.member(member.handle)) return;
    const others = this.members.filter((m) => m.id !== inviter.id).map(first);
    const withWho = others.length ? `you, ${others.join(", ")}` : "you";
    // Send the intro first: someone who can't be reached shouldn't count toward the plan.
    await thread.send(
      `Hi ${first(member)}! ${first(inviter)} is making plans with ${withWho} through ${this.agentName}, an AI assistant. ` +
        `I'll send the plan here. Anything you text here goes to the group, and 👍 on a plan counts as your yes. Text STOP to leave.`,
    );
    this.members.push(member);
    this.remember?.(member, thread);
    await this.broadcast(`Added ${first(member)}.`, member.id);
  }

  async leave(member: Member) {
    this.engine.group.members = this.members.filter((m) => m.id !== member.id);
    await this.broadcast(`${first(member)} left the plan.`);
  }

  /**
   * A member's text: everyone else sees it as they wrote it, then the engine
   * reads `forEngine` (the same text, with an implied mention in a DM).
   */
  async onText(member: Member, messageId: string, text: string, forEngine = text, kind?: IncomingMessage["kind"]) {
    await this.broadcast(`${first(member)}: ${text}`, member.id);
    await this.engine.onMessage({ id: messageId, senderId: member.id, text: forEngine, kind });
  }
}
