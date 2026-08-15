import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from '../../../../src/common/errors/domain-exception.filter';
import { DomainError } from '../../../../src/common/errors/domain-error';
import { AppLogger } from '../../../../src/common/logging/app-logger';

class NotFound extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly status = 404;
  readonly title = 'Product not found';
  constructor() {
    super('No product with that token.');
  }
}

// Explicitly typed so `reply.send.mock.calls[...]` stays `unknown`, not `any`,
// under strictTypeChecked — a bare `jest.fn()` infers `any` for every member.
interface ReplyMock {
  readonly status: jest.Mock<ReplyMock, [number]>;
  readonly type: jest.Mock<ReplyMock, [string]>;
  readonly send: jest.Mock<undefined, [unknown]>;
}

function hostFor(url: string): { host: ArgumentsHost; reply: ReplyMock } {
  const status = jest.fn<ReplyMock, [number]>();
  const type = jest.fn<ReplyMock, [string]>();
  const send = jest.fn<undefined, [unknown]>();
  const reply: ReplyMock = { status, type, send };
  status.mockReturnValue(reply);
  type.mockReturnValue(reply);

  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url }), getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  return { host, reply };
}

// AppLogger has a private field, so an object literal cannot structurally
// satisfy it without a cast; spying on a real instance keeps this cast-free
// and still substitutes the I/O (console output) the unit must not perform.
function createSilentLogger(): AppLogger {
  const logger = new AppLogger();
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  return logger;
}

describe('DomainExceptionFilter', () => {
  const logger = createSilentLogger();
  const filter = new DomainExceptionFilter(logger);

  it('renders a domain error as problem+json with its code', () => {
    const { host, reply } = hostFor('/products/ABC12345');
    filter.catch(new NotFound(), host);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.type).toHaveBeenCalledWith('application/problem+json');
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PRODUCT_NOT_FOUND',
        status: 404,
        instance: '/products/ABC12345',
      }),
    );
  });

  it('keeps the status of a framework exception and gives it a code', () => {
    const { host, reply } = hostFor('/nope');
    filter.catch(new HttpException('Not Found', 404), host);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ code: 'HTTP_ERROR' }));
  });

  it('hides the internals of an unknown error behind a 500', () => {
    const { host, reply } = hostFor('/products');
    filter.catch(new Error('connection string leaked'), host);
    expect(reply.status).toHaveBeenCalledWith(500);
    const body = reply.send.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('connection string leaked');
  });
});
