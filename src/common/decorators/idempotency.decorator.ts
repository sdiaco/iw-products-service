import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ValidationFailedError } from '../errors/validation-failed.error';
import { IDEMPOTENCY_KEY_PATTERN } from '../../products/products.constants';

const HEADER = 'idempotency-key';

const failValidation = (message: string): never => {
  throw new ValidationFailedError([
    { property: HEADER, constraints: { idempotencyKey: message }, children: [] },
  ]);
};

export const readIdempotencyKey = (raw: string | string[] | undefined): string => {
  if (raw === undefined) {
    return failValidation('the Idempotency-Key header is required');
  }
  if (Array.isArray(raw)) {
    return failValidation('the Idempotency-Key header must be sent once');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    return failValidation('the Idempotency-Key header must be 8-255 URL-safe characters');
  }
  return raw;
};

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return readIdempotencyKey(request.headers[HEADER]);
  },
);
