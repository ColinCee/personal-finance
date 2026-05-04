export const importSources = ["fake-monzo", "fake-amex"] as const;

export type ImportSource = (typeof importSources)[number];
