import { describe, expect, it } from "vitest";
import { parseRequest, zonedDate } from "@rendezvous/core";
import { parseInvites, toE164, unknownNames, withoutPhones } from "../src/invites.ts";

describe("invites", () => {
  it("reads names with numbers in common formats", () => {
    expect(parseInvites("@Rendezvous dinner tonight under $15 with Sandy 561-317-2754 and Maya (607) 555-0102", [])).toEqual([
      { name: "Sandy", phone: "+15613172754" },
      { name: "Maya", phone: "+16075550102" },
    ]);
    expect(parseInvites("add +16075550103", [])).toEqual([{ name: undefined, phone: "+16075550103" }]);
    expect(parseInvites("with dev: 607.555.0103", [])).toEqual([{ name: "Dev", phone: "+16075550103" }]);
  });

  it("reads known names without numbers", () => {
    expect(parseInvites("@Rendezvous lunch tomorrow with Sandy, Jason and Bob", ["Sandy", "Jason"])).toEqual([{ name: "Sandy" }, { name: "Jason" }]);
    expect(parseInvites("@Rendezvous lunch with friends", ["Sandy"])).toEqual([]);
  });

  it("keeps phone digits away from the planner", () => {
    const text = "@Rendezvous dinner tonight under $15 with Sandy 561-317-2754";
    expect(withoutPhones(text)).toBe("@Rendezvous dinner tonight under $15 with Sandy");
    const req = parseRequest(withoutPhones(text), zonedDate(2026, 10, 3, 17, 0), []);
    expect(req.budgetPerPerson).toBe(15);
    expect(req.constraints.preferredTime).toBeUndefined();
    expect(toE164("5613172754")).toBe("+15613172754");
  });
});

it("flags names it has no number for", () => {
  expect(unknownNames("dinner tonight with Sandy and Bob", ["Sandy"])).toEqual(["Bob"]);
  expect(unknownNames("dinner with Sandy 561-317-2754, Maya", ["Sandy"])).toEqual(["Maya"]);
  expect(unknownNames("lunch with the Roommates", [], ["roommates"])).toEqual([]);
  expect(unknownNames("dinner tonight at Collegetown with Sandy", ["Sandy"])).toEqual([]);
});
