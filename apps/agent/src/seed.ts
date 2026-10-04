import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ITHACA_VENUES } from "@rendezvous/core";
import { config } from "./config.ts";
import { createAccount, createCustomer, createMerchant, listMerchants, nessieEnabled } from "./nessie.ts";
import type { RosterEntry } from "./roster.ts";

/**
 * Seeds Nessie with the Ithaca venues as merchants and, with --members, gives
 * each roster member a customer and a checking account.
 *   npm run seed                 merchants only
 *   npm run seed -- --members    also customers + accounts ($40 each, Maya gets $10 to demo a failed transfer if you like)
 */

if (!nessieEnabled()) {
  console.error("Set NESSIE_API_KEY in apps/agent/.env first.");
  process.exit(1);
}

const existing = await listMerchants().catch(() => []);
const ids: Record<string, string> = existsSync(config.merchantsFile) ? JSON.parse(readFileSync(config.merchantsFile, "utf8")) : {};

for (const v of ITHACA_VENUES) {
  const found = existing.find((m) => m.name === v.name);
  if (found) {
    ids[v.id] = found._id;
    console.log(`= ${v.name} (${found._id})`);
    continue;
  }
  const [num, ...street] = v.address.split(",")[0]!.split(" ");
  ids[v.id] = await createMerchant({
    name: v.name,
    category: `restaurant: ${v.cuisine}`,
    address: { street_number: num!, street_name: street.join(" "), city: "Ithaca", state: "NY", zip: "14850" },
    geocode: v.location,
  });
  console.log(`+ ${v.name} (${ids[v.id]})`);
}
writeFileSync(config.merchantsFile, JSON.stringify(ids, null, 2));
console.log(`Saved merchant ids to ${config.merchantsFile}`);

if (process.argv.includes("--members")) {
  if (!existsSync(config.membersFile)) {
    console.error(`Create ${config.membersFile} first (copy data/members.example.json).`);
    process.exit(1);
  }
  const roster = JSON.parse(readFileSync(config.membersFile, "utf8")) as RosterEntry[];
  for (const r of roster) {
    if (r.nessieAccountId) {
      console.log(`= ${r.name} already has ${r.nessieAccountId}`);
      continue;
    }
    const customer = await createCustomer(r.name, "Rendezvous");
    r.nessieAccountId = await createAccount(customer, `${r.name}'s checking`, 40);
    console.log(`+ ${r.name}: customer ${customer}, account ${r.nessieAccountId}`);
  }
  writeFileSync(config.membersFile, JSON.stringify(roster, null, 2));
  console.log(`Saved account ids to ${config.membersFile}`);
}
