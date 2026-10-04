import { routeMessage, type RouteContext } from "./understand.ts";

/**
 * Sends tricky phrasings through the Grok router and prints what it decided.
 * Run after adding xAI credits: npm run check:grok -w @rendezvous/agent
 */
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({
  agentName: "Rendezvous",
  now: new Date(),
  senderName: "Jason",
  phase: "none",
  isOrganizer: true,
  openQuestion: null,
  members: [],
  contacts: ["Sandy"],
  groups: ["Roommates"],
  hasUnpaidShare: false,
  ...over,
});

const cases: Array<[string, RouteContext, string]> = [
  ["yo can you save my roommate sandy, her cell is 561 317 2754", ctx(), "save_contacts"],
  ["sandy = 5613172754", ctx(), "save_contacts"],
  ["my roommates are Sandy and Maya 607-555-0102", ctx(), "save_group"],
  ["who do you have saved", ctx(), "list_contacts"],
  ["anyone down for food later? me + the roommates, cheap pls", ctx(), "start_plan"],
  ["get Bob in on this too, he's 607 555 0199", ctx({ phase: "proposed", members: ["Jason", "Sandy"] }), "add_people"],
  ["ya that works for me", ctx({ phase: "proposed", members: ["Jason", "Sandy"] }), "approve"],
  ["eh not feeling pizza, something closer to collegetown?", ctx({ phase: "proposed", members: ["Jason", "Sandy"] }), "change_plan"],
  [
    "the booth one",
    ctx({ phase: "booking", openQuestion: { question: "Booth or a table by the window?", options: ["Booth", "Table by the window"] } }),
    "choose_option",
  ],
  ["ok I covered it, 52 bucks total", ctx({ phase: "locked", members: ["Jason", "Sandy"] }), "paid"],
  ["maya had an extra drink so +5 for her", ctx({ phase: "locked", members: ["Jason", "Maya"] }), "adjust_split"],
  ["I'm out, sorry", ctx({ phase: "proposed", members: ["Jason", "Sandy"] }), "leave"],
];

let pass = 0;
for (const [text, c, expected] of cases) {
  const r = await routeMessage(text, c);
  if (!r) {
    console.log("Grok unavailable (no key or no credits). Nothing to check yet.");
    process.exit(1);
  }
  const ok = r.intent === expected;
  pass += ok ? 1 : 0;
  const extra = [r.contacts.length && `contacts=${JSON.stringify(r.contacts)}`, r.people.length && `people=${JSON.stringify(r.people)}`, r.groups.length && `groups=${r.groups}`, r.plan_text && `plan="${r.plan_text}"`, r.change_text && `change="${r.change_text}"`, r.choice && `choice=${r.choice}`, r.amount !== null && `amount=${r.amount}`, r.adjust_name && `adjust=${r.adjust_name}`, r.group_name && `group=${r.group_name}`].filter(Boolean).join(" ");
  console.log(`${ok ? "✓" : "✗"} ${r.intent.padEnd(18)} ${text}\n    ${extra}`);
}
console.log(`\n${pass}/${cases.length} as expected`);
