export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly [member: string]: unknown;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function buildProblem(args: {
  status: number;
  title: string;
  code: string;
  detail: string;
  instance: string;
  extra?: Record<string, unknown>;
}): ProblemDetails {
  return {
    type: `/errors/${args.code.toLowerCase().replaceAll('_', '-')}`,
    title: args.title,
    status: args.status,
    detail: args.detail,
    instance: args.instance,
    code: args.code,
    ...args.extra,
  };
}
