export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }

  /** Extra members merged into the problem body. Empty unless overridden. */
  extra(): Record<string, unknown> {
    return {};
  }
}
