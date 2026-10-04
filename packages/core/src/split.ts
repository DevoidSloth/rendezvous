import type { Member, Split } from "./types.ts";

const cents = (n: number) => Math.round(n * 100);

/**
 * Splits a bill equally, then applies per-person adjustments
 * ("add $5 to Maya's"). Adjustments come out of everyone else's base share,
 * so the lines always add back up to the total. Leftover cents stay with the
 * payer, so $52 across three people is $17.33 each from the two debtors.
 */
export function computeSplit(
  chatId: string,
  payerId: string,
  total: number,
  members: Member[],
  adjustments: Record<string, number> = {},
): Split {
  if (!(total > 0)) throw new Error("Total must be more than $0");
  const totalC = cents(total);
  const adjC = members.map((m) => cents(adjustments[m.id] ?? 0));
  const remaining = totalC - adjC.reduce((a, b) => a + b, 0);
  const n = members.length;
  const base = Math.floor(remaining / n);
  const shares = members.map((_, i) => base + adjC[i]!);
  return {
    chatId,
    payerId,
    total,
    lines: members
      .map((m, i) => ({ memberId: m.id, amount: shares[i]! / 100, confirmed: false }))
      .filter((l) => l.memberId !== payerId && l.amount > 0),
  };
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}
