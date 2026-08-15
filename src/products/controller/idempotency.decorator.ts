import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ValidationFailedError } from '../../common/errors/validation-failed.error';
import { IDEMPOTENCY_KEY_PATTERN } from '../products.constants';

const HEADER = 'idempotency-key';

export function readIdempotencyKey(raw: string | string[] | undefined): string {
  const fail = (message: string): never => {
    throw new ValidationFailedError([
      { property: HEADER, constraints: { idempotencyKey: message }, children: [] },
    ]);
  };

  if (raw === undefined) {
    return fail('the Idempotency-Key header is required');
  }
  if (Array.isArray(raw)) {
    return fail('the Idempotency-Key header must be sent once');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    return fail('the Idempotency-Key header must be 8-255 URL-safe characters');
  }
  return raw;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return readIdempotencyKey(request.headers[HEADER]);
  },
);
