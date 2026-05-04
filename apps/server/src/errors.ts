export class ReviewItemNotFoundError extends Error {
  constructor(reviewItemId: string) {
    super(`Review item not found: ${reviewItemId}`);
    this.name = "ReviewItemNotFoundError";
  }
}
