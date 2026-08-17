import type { ValidationError } from 'class-validator';
import { DomainError } from './domain-error';

interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly status = 400;
  readonly title = 'Validation failed';
  private readonly fieldErrors: readonly FieldError[];

  constructor(errors: readonly ValidationError[]) {
    super('The request did not pass validation.');
    this.fieldErrors = ValidationFailedError.flatten(errors);
  }

  extra(): Record<string, unknown> {
    return { errors: this.fieldErrors };
  }

  private static flatten(errors: readonly ValidationError[], prefix = ''): FieldError[] {
    return errors.flatMap((error) => {
      const field = prefix === '' ? error.property : `${prefix}.${error.property}`;
      const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
      return [...own, ...ValidationFailedError.flatten(error.children ?? [], field)];
    });
  }
}
