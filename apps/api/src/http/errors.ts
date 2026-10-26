/** Thrown by services; translated to HTTP responses by the error middleware. */
export class ValidationError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super(details.join('; '));
    this.name = 'ValidationError';
    this.details = details;
  }
}

/** Thrown when an item does not exist or belongs to another client. */
export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}
