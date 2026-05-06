import { existsSync, readFileSync } from "node:fs";

import {
  classificationConfidences,
  entryKinds,
  importSources,
  type LocalClassificationRule,
} from "@personal-finance/core";
import { z } from "zod";

const localClassificationRulesFileSchema = z.object({
  version: z.literal(1),
  rules: z.array(
    z.object({
      id: z.string().trim().min(1).max(120),
      label: z.string().trim().min(1).max(200),
      enabled: z.boolean().optional(),
      match: z.object({
        descriptionContains: z.array(z.string().trim().min(1)).min(1),
        amountDirection: z.enum(["any", "money_in", "money_out"]).optional(),
        sources: z.array(z.enum(importSources)).optional(),
      }),
      classifyAs: z.enum(entryKinds),
      confidence: z.enum(classificationConfidences).optional(),
      reviewRequired: z.boolean().optional(),
    }),
  ),
});

export function loadLocalClassificationRules(
  rulesPath: string,
): LocalClassificationRule[] {
  if (!existsSync(rulesPath)) {
    return [];
  }

  const parsed = localClassificationRulesFileSchema.parse(
    JSON.parse(readFileSync(rulesPath, "utf8")),
  );

  return parsed.rules;
}
