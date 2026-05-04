import { z } from "zod";

const transactionSchema = z.object({
  id: z.string(),
  postedOn: z.string(),
  description: z.string(),
  amountMinorUnits: z.number().int(),
  currency: z.string(),
  kind: z.string(),
  source: z.string(),
  reviewStatus: z.string(),
  affectsPersonalSpend: z.boolean(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export async function fetchTransactions(): Promise<Transaction[]> {
  const response = await fetch("/api/transactions");

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }

  return z.array(transactionSchema).parse(await response.json());
}
