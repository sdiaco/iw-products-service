import { DomainError } from './domain-error';

export class DatabaseUnavailableError extends DomainError {
  readonly code = 'DATABASE_UNAVAILABLE';
  readonly status = 503;
  readonly title = 'Database unavailable';

  constructor() {
    super('The service cannot reach its database.');
  }
}

export class ConcurrentModificationError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';
  readonly status = 409;
  readonly title = 'Concurrent modification';

  constructor() {
    super('The row was locked by another request. The change was not applied; retry.');
  }
}
