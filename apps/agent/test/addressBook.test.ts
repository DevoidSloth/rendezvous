import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AddressBook, contactPairs, parseBookCommand } from "../src/addressBook.ts";
import { parseInvites } from "../src/invites.ts";

const JASON = "+15616763897";

describe("address book", () => {
  it("saves contacts per organizer and persists them", () => {
    const file = join(mkdtempSync(join(tmpdir(), "rdv-")), "contacts.json");
    const book = new AddressBook(file);
    expect(book.saveContact(JASON, "sandy", "+15613172754")).toBe(true);
    expect(book.saveContact(JASON, "Sandy", "+15613172754")).toBe(false);
    expect(book.contact(JASON, "SANDY")).toEqual({ name: "Sandy", phone: "+15613172754" });
    // Someone else's book is separate.
    expect(book.contact("+16075550102", "Sandy")).toBeUndefined();
    // A fresh instance reads it back from disk.
    expect(new AddressBook(file).contact(JASON, "sandy")?.phone).toBe("+15613172754");
    expect(JSON.parse(readFileSync(file, "utf8"))[JASON].contacts.sandy.name).toBe("Sandy");
  });

  it("finds saved groups after with/add/invite only", () => {
    const book = new AddressBook();
    book.saveGroup(JASON, "dinner crew", ["+15613172754", "+16075550102", JASON]);
    const g = book.group(JASON, "Dinner Crew")!;
    expect(g.name).toBe("Dinner Crew");
    expect(g.members).toEqual(["+15613172754", "+16075550102"]); // the owner isn't stored
    expect(book.groupsIn(JASON, "lunch tomorrow with the dinner crew").map((x) => x.name)).toEqual(["Dinner Crew"]);
    expect(book.groupsIn(JASON, "dinner crew is the best")).toEqual([]);
    expect(book.forget(JASON, "dinner crew")).toBe("group");
    expect(book.forget(JASON, "nobody")).toBeUndefined();
  });

  it("parses commands", () => {
    expect(parseBookCommand("save Sandy 561-317-2754")).toEqual({ kind: "saveContact", name: "Sandy", phone: "561-317-2754" });
    expect(parseBookCommand("remember Sandy Lee as (561) 317-2754")).toEqual({ kind: "saveContact", name: "Sandy Lee", phone: "(561) 317-2754" });
    expect(parseBookCommand("save group Roommates: Sandy, Maya 607-555-0102")).toEqual({ kind: "saveGroup", name: "Roommates", list: "Sandy, Maya 607-555-0102" });
    expect(parseBookCommand("create a group called Dinner crew with Sandy and Maya")).toEqual({ kind: "saveGroup", name: "Dinner crew", list: "Sandy and Maya" });
    expect(parseBookCommand("save this group as Dinner crew")).toEqual({ kind: "saveCurrentGroup", name: "Dinner crew" });
    expect(parseBookCommand("contacts")).toEqual({ kind: "listContacts" });
    expect(parseBookCommand("show my groups")).toEqual({ kind: "listGroups" });
    expect(parseBookCommand("forget Sandy")).toEqual({ kind: "forget", name: "Sandy" });
    expect(parseBookCommand("dinner tonight with Sandy 561-317-2754")).toBeUndefined();
    expect(parseBookCommand("I paid $52")).toBeUndefined();
  });

  it("matches multi-word names, longest first", () => {
    expect(parseInvites("dinner with Sandy Lee and Maya", ["Sandy", "Sandy Lee", "Maya"])).toEqual([{ name: "Sandy Lee" }, { name: "Maya" }]);
    expect(parseInvites("dinner with Sandy and Maya", ["Sandy", "Sandy Lee", "Maya"])).toEqual([{ name: "Sandy" }, { name: "Maya" }]);
  });
});

it("understands natural ways of giving a number", () => {
  const p = (t: string) => contactPairs(t).map((x) => [x.name, x.phone.replace(/\D/g, "").slice(-10)]);
  expect(p("Sandy's number is 561-317-2754")).toEqual([["Sandy", "5613172754"]]);
  expect(p("the number for Sandy is (561) 317-2754")).toEqual([["Sandy", "5613172754"]]);
  expect(p("Sandy is 5613172754")).toEqual([["Sandy", "5613172754"]]);
  expect(p("my friend Sandy: +1 561 317 2754")).toEqual([["Sandy", "5613172754"]]);
  expect(p("Sandy Lee 561.317.2754 and Maya 607-555-0102")).toEqual([["Sandy Lee", "5613172754"], ["Maya", "6075550102"]]);
  expect(p("call me at 561-317-2754")).toEqual([]);
  expect(parseBookCommand("save Sandy's number 561-317-2754")).toEqual({ kind: "saveContact", name: "Sandy", phone: "561-317-2754" });
});
