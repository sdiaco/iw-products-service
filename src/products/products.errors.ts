import { DomainError } from '../common/errors/domain-error';

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly status = 404;
  readonly title = 'Product not found';

  constructor(productToken: string) {
    super(`No product exists with token ${productToken}.`);
  }
}

export class ProductTokenAlreadyExistsError extends DomainError {
  readonly code = 'PRODUCT_TOKEN_ALREADY_EXISTS';
  readonly status = 409;
  readonly title = 'Product token already exists';

  constructor(productToken: string) {
    super(`A product with token ${productToken} already exists.`);
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly status = 409;
  readonly title = 'Insufficient stock';

  constructor(private readonly available: number) {
    super('Stock cannot go below zero.');
  }

  /** Advisory and point-in-time: a concurrent request may change it. */
  extra(): Record<string, unknown> {
    return { available: this.available };
  }
}

export class StockLimitExceededError extends DomainError {
  readonly code = 'STOCK_LIMIT_EXCEEDED';
  readonly status = 409;
  readonly title = 'Stock limit exceeded';

  constructor() {
    super('Stock cannot exceed the maximum a signed integer can hold.');
  }
}
