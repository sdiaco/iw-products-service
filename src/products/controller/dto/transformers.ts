import type { TransformFnParams } from 'class-transformer';

/**
 * Accepts a number or a string and hands a string to the validator.
 * String(19.999) stays "19.999" and is then rejected by the pattern — rounding
 * someone's price silently would be worse than a 400.
 */
export function toDecimalString({ value }: TransformFnParams): unknown {
  return typeof value === 'number' ? String(value) : value;
}

export function trimValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
