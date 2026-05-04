import type { ReviewTransaction } from "@personal-finance/core";

import type { TransactionsRepository } from "../repositories/transactions-repository";

export type TransactionsService = {
  listReviewTransactions: () => ReviewTransaction[];
};

export function createTransactionsService(
  transactionsRepository: TransactionsRepository,
): TransactionsService {
  return {
    listReviewTransactions: () =>
      transactionsRepository.listReviewTransactions(),
  };
}
