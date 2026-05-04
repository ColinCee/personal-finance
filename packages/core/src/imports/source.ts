export const fileImportSources = [
  "fixture_csv",
  "monzo_csv",
  "amex_csv",
] as const;

export type FileImportSource = (typeof fileImportSources)[number];

export const importSources = [
  "fake-monzo",
  "fake-amex",
  "monzo",
  "amex",
] as const;

export type ImportSource = (typeof importSources)[number];
