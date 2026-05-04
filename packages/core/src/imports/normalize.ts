import { z } from "zod";

import { decimalStringToMinorUnits } from "../money/amount";
import { entryKinds } from "../transactions/kinds";
import { importSources } from "./source";
import type { Currency, MinorUnitAmount } from "../money/amount";
import type { EntryKind } from "../transactions/kinds";
import type { ImportSource } from "./source";

export type NormalizedTransactionInput = {
  id: string;
  postedOn: string;
  description: string;
  amountMinorUnits: MinorUnitAmount;
  currency: Currency;
  kind: EntryKind;
  source: ImportSource;
};

const fixtureTransactionRowSchema = z.object({
  posted_on: z.iso.date(),
  description: z.string().min(1),
  amount: z.string().regex(/^-?\d+(\.\d{2})?$/),
  currency: z.literal("GBP"),
  kind: z.enum(entryKinds),
  source: z.enum(importSources),
});

const fixtureCsvHeaders = [
  "posted_on",
  "description",
  "amount",
  "currency",
  "kind",
  "source",
] as const;

type FixtureCsvHeader = (typeof fixtureCsvHeaders)[number];

export function parseFixtureTransactionsCsv(
  csv: string,
): NormalizedTransactionInput[] {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Fixture CSV is empty");
  }

  const [headerLine, ...rowLines] = lines;
  const headers = parseCsvLine(headerLine);

  if (headers.join(",") !== fixtureCsvHeaders.join(",")) {
    throw new Error(`Unexpected fixture CSV headers: ${headers.join(",")}`);
  }

  return rowLines.map((line, index) => {
    const values = parseCsvLine(line);

    if (values.length !== fixtureCsvHeaders.length) {
      throw new Error(
        `Fixture CSV row ${index + 2} has ${values.length} columns; expected ${fixtureCsvHeaders.length}`,
      );
    }

    const row = Object.fromEntries(
      fixtureCsvHeaders.map((header, valueIndex) => [
        header,
        values[valueIndex],
      ]),
    ) as Record<FixtureCsvHeader, string>;

    const parsedRow = fixtureTransactionRowSchema.parse(row);

    return {
      id: `fixture:${index}:${parsedRow.posted_on}:${parsedRow.source}`,
      postedOn: parsedRow.posted_on,
      description: parsedRow.description,
      amountMinorUnits: decimalStringToMinorUnits(parsedRow.amount),
      currency: parsedRow.currency as Currency,
      kind: parsedRow.kind,
      source: parsedRow.source,
    };
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(value);
      value = "";
      continue;
    }

    value += character;
  }

  if (insideQuotes) {
    throw new Error(`Unterminated quoted CSV value: ${line}`);
  }

  values.push(value);

  return values;
}
