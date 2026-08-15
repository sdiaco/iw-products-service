import { readIdempotencyKey } from '../../../src/products/controller/idempotency.decorator';
import { ValidationFailedError } from '../../../src/common/errors/validation-failed.error';

describe('readIdempotencyKey', () => {
  it('accepts an opaque URL-safe key', () => {
    expect(readIdempotencyKey('9f8c1a2e-4b7d')).toBe('9f8c1a2e-4b7d');
  });

  it('rejects a missing header', () => {
    expect(() => readIdempotencyKey(undefined)).toThrow(ValidationFailedError);
  });

  it('rejects a repeated header', () => {
    expect(() => readIdempotencyKey(['a-key-value', 'another-key'])).toThrow(ValidationFailedError);
  });

  it('rejects a key that is too short', () => {
    expect(() => readIdempotencyKey('short')).toThrow(ValidationFailedError);
  });
});
