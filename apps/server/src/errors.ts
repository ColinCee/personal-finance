export class ReviewItemNotFoundError extends Error {
  constructor(reviewItemId: string) {
    super(`Review item not found: ${reviewItemId}`);
    this.name = "ReviewItemNotFoundError";
  }
}

export class ReviewItemAlreadyResolvedError extends Error {
  constructor(reviewItemId: string) {
    super(`Review item is already resolved: ${reviewItemId}`);
    this.name = "ReviewItemAlreadyResolvedError";
  }
}

export class AllocationDecisionInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationDecisionInvalidError";
  }
}
