export type Currency = "GBP";

export type MinorUnitAmount = number;

export function majorUnitsToMinorUnits(amount: number): MinorUnitAmount {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Invalid money amount: ${amount}`);
  }

  return Math.round(amount * 100);
}

export function minorUnitsToMajorUnits(amount: MinorUnitAmount): number {
  return amount / 100;
}

export function addMinorUnitAmounts(
  amounts: readonly MinorUnitAmount[],
): MinorUnitAmount {
  return amounts.reduce((total, amount) => total + amount, 0);
}
