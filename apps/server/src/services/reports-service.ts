import type { MonthlyReport } from "@personal-finance/core";

import type { ReportsRepository } from "../repositories/reports-repository";

export type ReportsService = {
  listMonthlyReports: () => MonthlyReport[];
};

export function createReportsService(
  reportsRepository: ReportsRepository,
): ReportsService {
  return {
    listMonthlyReports: () => reportsRepository.listMonthlyReports(),
  };
}
