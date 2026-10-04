import { config } from "./config.ts";

/**
 * Capital One Nessie client. Nessie is a sandbox bank: seeded merchants act as
 * the venue directory, account balances filter venues, and P2P transfers
 * settle the bill. Without NESSIE_API_KEY it runs against an in-memory ledger
 * so the loop still works offline.
 */

export interface NessieAccount {
  _id: string;
  type: string;
  nickname: string;
  balance: number;
  customer_id: string;
}

export interface NessieMerchant {
  _id: string;
  name: string;
  category: string[] | string;
  geocode?: { lat: number; lng: number };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${config.nessieBaseUrl}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(config.nessieApiKey)}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Nessie ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Offline ledger used when no API key is set. Every account starts with $60. */
const mockBalances = new Map<string, number>();
const mockBalance = (id: string) => mockBalances.get(id) ?? 60;

export const nessieEnabled = () => Boolean(config.nessieApiKey);

export async function getBalance(accountId: string): Promise<number | undefined> {
  if (!accountId) return undefined;
  if (!nessieEnabled()) return mockBalance(accountId);
  const acct = await call<NessieAccount>("GET", `/accounts/${accountId}`);
  return acct.balance;
}

export async function transfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  description: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!fromAccountId || !toAccountId) return { ok: false, error: "no linked account" };
  if (!nessieEnabled()) {
    if (mockBalance(fromAccountId) < amount) return { ok: false, error: "insufficient funds" };
    mockBalances.set(fromAccountId, mockBalance(fromAccountId) - amount);
    mockBalances.set(toAccountId, mockBalance(toAccountId) + amount);
    return { ok: true, id: `mock-${Date.now().toString(36)}` };
  }
  // The live API doesn't stop overdrafts, so check the balance first and fail cleanly.
  const balance = await getBalance(fromAccountId);
  if (balance !== undefined && balance < amount) return { ok: false, error: "insufficient funds" };
  // As of Oct 2026 the live API differs from the old SDK docs: transfers take no
  // payee or medium, amounts are stored as whole dollars, and balances don't
  // move. So the transfer goes on the debtor's account, a matching deposit goes
  // on the payer's, and the exact amount and payee ride in the description.
  // The agent's split stays the source of truth for cents.
  const exact = `$${amount.toFixed(2)}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await call<{ objectCreated?: { _id: string } }>("POST", `/accounts/${fromAccountId}/transfers`, {
      transaction_date: today,
      status: "completed",
      amount,
      description: `${description}: ${exact} to account ${toAccountId}`,
    });
    await call("POST", `/accounts/${toAccountId}/deposits`, {
      medium: "balance",
      transaction_date: today,
      status: "completed",
      amount,
      description: `${description}: ${exact} from account ${fromAccountId}`,
    }).catch((err) => console.warn("payee-side deposit record failed", String(err)));
    return { ok: true, id: res.objectCreated?._id ?? "unknown" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function createCustomer(first: string, last: string): Promise<string> {
  const res = await call<{ objectCreated: { _id: string } }>("POST", "/customers", {
    first_name: first,
    last_name: last,
    address: { street_number: "1", street_name: "Ho Plaza", city: "Ithaca", state: "NY", zip: "14853" },
  });
  return res.objectCreated._id;
}

export async function createAccount(customerId: string, nickname: string, balance: number): Promise<string> {
  const res = await call<{ objectCreated: { _id: string } }>("POST", `/customers/${customerId}/accounts`, {
    type: "Checking",
    nickname,
    rewards: 0,
    balance,
  });
  return res.objectCreated._id;
}

export async function listMerchants(): Promise<NessieMerchant[]> {
  const res = await call<NessieMerchant[] | { data: NessieMerchant[] }>("GET", "/merchants");
  return Array.isArray(res) ? res : res.data;
}

export async function createMerchant(m: {
  name: string;
  /** The live API takes a single string here, not the array older SDKs show. */
  category: string;
  address: { street_number: string; street_name: string; city: string; state: string; zip: string };
  geocode: { lat: number; lng: number };
}): Promise<string> {
  const res = await call<{ objectCreated: { _id: string } }>("POST", "/merchants", m);
  return res.objectCreated._id;
}
