export class ReviewItemNotFoundError extends Error {
  constructor(reviewItemId: string) {
    super(`Review item not found: ${reviewItemId}`);
    this.name = "ReviewItemNotFoundError";
  }
}

export class AllocationDecisionInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationDecisionInvalidError";
  }
}
