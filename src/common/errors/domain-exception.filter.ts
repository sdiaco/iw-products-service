import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { AppLogger } from '../logging/app-logger';
import { DomainError } from './domain-error';
import { PROBLEM_CONTENT_TYPE, buildProblem } from './problem-details';

// The real Fastify types would require declaring `fastify` as a direct
// dependency for a package we only ever reach through the platform adapter;
// this is the exact slice of request/reply this filter actually touches.
interface RequestLike {
  readonly url: string;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  type(contentType: string): ReplyLike;
  send(body: unknown): void;
}

/**
 * Registered for everything, not only for DomainError: malformed JSON, an
 * unknown route and a wrong method are raised by the framework, and without
 * this the API would answer in two different error formats.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const instance = http.getRequest<RequestLike>().url;
    const reply = http.getResponse<ReplyLike>();

    if (exception instanceof DomainError) {
      const problem = buildProblem({
        status: exception.status,
        title: exception.title,
        code: exception.code,
        detail: exception.message,
        instance,
        extra: exception.extra(),
      });
      reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
      return;
    }

    if (exception instanceof HttpException) {
      const problem = buildProblem({
        status: exception.getStatus(),
        title: exception.name,
        code: 'HTTP_ERROR',
        detail: exception.message,
        instance,
      });
      reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
      return;
    }

    // 5xx is ours: log it with its stack. 4xx above is the client's and is not.
    this.logger.error(
      `Unhandled error on ${instance}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    const problem = buildProblem({
      status: 500,
      title: 'Internal server error',
      code: 'INTERNAL_ERROR',
      detail: 'The request could not be completed.',
      instance,
    });
    reply.status(500).type(PROBLEM_CONTENT_TYPE).send(problem);
  }
}
