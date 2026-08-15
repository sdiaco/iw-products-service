# Products Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the products service defined in
[the design](./2026-08-14-products-service-design.md) — five CRUD endpoints plus
health, on NestJS and Sequelize against MySQL, with unit and end-to-end tests
and a one-command local environment.

**Architecture:** One NestJS HTTP application on the Fastify adapter. `src/` is
feature-first: `products/` holds `controller/`, `service/` and `repository/`,
and cross-cutting code lives in `common/`, `config/` and `database/`. Sequelize
is wired by hand through custom providers; models are injected by token so a
unit test can substitute them. Every failure is a `DomainError` translated to
RFC 9457 `problem+json` by one catch-all filter.

**Tech Stack:** Node 24 · TypeScript 5.9.3 (CommonJS) · NestJS 11.1.29 ·
`@nestjs/platform-fastify` · Sequelize 6.37.8 · mysql2 3.23.3 · MySQL 8.4 ·
Umzug 3.8.3 · class-validator 0.15.1 · `@nestjs/swagger` 11.4.6 · Jest 30.4.2 ·
ts-jest 29.4.12 · supertest 7.2.2 · ESLint 10.8.1 · lefthook 2.1.10 · pnpm 10.

**Order of work:** slices are vertical and ordered so that the repository is a
valid submission from the end of Slice 3 onward. Slice 5 (idempotency) is the
one part that may be dropped if time runs out; Slice 6 must not be.

---

## Conventions for every task

- **No path aliases.** All imports are relative. This keeps `tsc`, `ts-jest`
  and Node's type stripping in agreement with no extra configuration.
- **Commit after every task**, with the message given in the task.
- Run `pnpm lint && pnpm typecheck` before each commit; both must be clean.
- Do not use `sequelize.sync()` anywhere, in code or in tests.

## File structure

```
docker-compose.yml  Dockerfile  Makefile  lefthook.yml
eslint.config.mjs   .prettierrc  tsconfig.json
jest.config.ts      jest.e2e.config.ts     .env.example

db/
  umzug.ts                          migration runner
  init/01-create-databases.sql      both schemas + the app user
  migrations/001-create-products.ts
  migrations/002-create-idempotency-keys.ts
  seeds/products.seed.ts            idempotent demo catalogue

src/
  main.ts                           bootstrap only
  app.setup.ts                      pipes, filter, Swagger — shared with e2e
  app.module.ts
  config/env.schema.ts              validated environment
  config/config.module.ts           provides ENV
  common/errors/domain-error.ts     abstract base
  common/errors/problem-details.ts  the RFC 9457 shape
  common/errors/validation-failed.error.ts
  common/errors/infrastructure.errors.ts   database unavailable, concurrency
  common/errors/domain-exception.filter.ts catch-all translation
  common/logging/app-logger.ts
  database/database.tokens.ts       SEQUELIZE, PRODUCT_MODEL, IDEMPOTENCY_MODEL
  database/database.providers.ts
  database/database.module.ts
  health/health.controller.ts, health.module.ts
  products/product.ts               plain readonly type
  products/products.constants.ts    patterns, page defaults, INT_MAX
  products/products.errors.ts       the module's typed failures
  products/products.module.ts
  products/controller/products.controller.ts
  products/controller/product.response.ts
  products/controller/idempotency-key.decorator.ts
  products/controller/dto/*.ts      create, list query, token param, stock
  products/service/products.service.ts
  products/repository/product.repository.ts
  products/repository/idempotency.repository.ts
  products/repository/models/product.model.ts
  products/repository/models/idempotency-key.model.ts

test/
  unit/**                           mirrors src/
  e2e/setup/{global-setup,app.factory,database}.ts
  e2e/*.e2e-spec.ts
```

**Why models are injected by token.** `ProductModel` is registered as a
provider (`PRODUCT_MODEL`) built from the Sequelize instance, and the repository
receives it in its constructor. A repository unit test then substitutes a mock
model object — which is literally what the brief asks for ("unit tests with the
Sequelize model mocked") — without any module mocking machinery.

---

# Slice 0 — Foundations

At the end of this slice `docker compose up` starts MySQL, applies migrations
and serves `GET /health`, and `make test` runs a green (nearly empty) suite.

### Task 0.1: Project skeleton and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.prettierrc`,
  `eslint.config.mjs`, `lefthook.yml`, `.gitignore`, `.dockerignore`

- [ ] **Step 1: Initialise the package and install dependencies**

```bash
pnpm init
pnpm add @nestjs/common@11.1.29 @nestjs/core@11.1.29 \
  @nestjs/platform-fastify@11.1.29 @nestjs/swagger@11.4.6 \
  class-validator@0.15.1 class-transformer sequelize@6.37.8 mysql2@3.23.3 \
  umzug@3.8.3 reflect-metadata rxjs
pnpm add -D @nestjs/cli @nestjs/schematics @nestjs/testing typescript@5.9.3 \
  jest@30.4.2 ts-jest@29.4.12 @types/jest @types/node@24.13.3 \
  supertest@7.2.2 @types/supertest eslint@10.8.1 typescript-eslint@8.67.0 \
  eslint-plugin-import-x prettier@3.9.6 lefthook@2.1.10 dotenv
```

- [ ] **Step 2: Write `package.json` scripts**

```json
{
  "name": "products-service",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "jest --config jest.config.ts",
    "test:e2e": "jest --config jest.e2e.config.ts --runInBand",
    "migrate": "node db/umzug.ts up",
    "seed": "node db/seeds/products.seed.ts",
    "prepare": "lefthook install || true"
  }
}
```

`prepare` ends in `|| true` because `pnpm install` also runs it inside the
Docker build, where there is no `.git` directory and lefthook exits non-zero.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2023",
    "lib": ["ES2023"],
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "sourceMap": true,
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "test/**/*", "db/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3b: Write `tsconfig.build.json`**

The configuration above spans three sibling directories, so TypeScript infers
the repository root as the common source root and emits `dist/src/main.js` —
and `start:prod` runs `node dist/main.js`. A second, narrower configuration is
what `nest build` uses, and it is the one that decides the output layout.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "db", "**/*.spec.ts"]
}
```

Setting `rootDir` on the wide configuration instead would fail with `TS6059`,
because `test/` and `db/` sit outside it — and they must stay covered by
`pnpm typecheck`.

- [ ] **Step 4: Write `eslint.config.mjs`**

```js
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: {
      'import-x/resolver': { node: { extensions: ['.ts', '.js'] } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-restricted-imports': ['error', {
        paths: [{ name: 'sequelize', message: 'The ORM may only be imported under repository/ or database/.' }],
      }],
      'import-x/no-restricted-paths': ['error', {
        zones: [
          { target: './src/products/controller', from: './src/products/repository',
            message: 'The controller must not reach the repository.' },
        ],
      }],
    },
  },
  {
    files: ['src/**/repository/**/*.ts', 'src/database/**/*.ts', 'db/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
```

- [ ] **Step 5: Write `lefthook.yml`**

```yaml
pre-push:
  parallel: false
  commands:
    format:
      run: pnpm format
    lint:
      run: pnpm lint
    types:
      run: pnpm typecheck
    unit:
      run: pnpm test
    e2e:
      run: pnpm test:e2e
```

- [ ] **Step 6: Write `.gitignore` and `.dockerignore`**

```gitignore
node_modules/
dist/
coverage/
.env
*.log
```

```dockerignore
node_modules
dist
coverage
.git
notes
assessment
```

- [ ] **Step 7: Verify the toolchain runs**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0 (no source files yet, so nothing to report).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: set up the toolchain, linting and the pre-push gate"
```

---

### Task 0.2: Local environment

**Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `Makefile`,
  `db/init/01-create-databases.sql`, `.env.example`

- [ ] **Step 1: Write `db/init/01-create-databases.sql`**

```sql
CREATE DATABASE IF NOT EXISTS ecommerce      CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS ecommerce_test CHARACTER SET utf8mb4;

CREATE USER IF NOT EXISTS 'products'@'%' IDENTIFIED BY 'products';
GRANT ALL PRIVILEGES ON ecommerce.*      TO 'products'@'%';
GRANT ALL PRIVILEGES ON ecommerce_test.* TO 'products'@'%';
FLUSH PRIVILEGES;
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]
```

`--ignore-scripts` is what stops the lefthook `prepare` script from failing the
build in an image that has no `.git` directory.

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root}
    ports:
      - "${DB_PORT:-3307}:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-p${MYSQL_ROOT_PASSWORD:-root}"]
      interval: 3s
      timeout: 5s
      retries: 20

  migrate:
    build: .
    command: sh -c "pnpm migrate && pnpm seed"
    environment: &app-env
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 3000
      DB_HOST: mysql
      DB_PORT: 3306
      DB_NAME: ${DB_NAME:-ecommerce}
      DB_USER: ${DB_USER:-products}
      DB_PASSWORD: ${DB_PASSWORD:-products}
      DB_POOL_MAX: ${DB_POOL_MAX:-25}
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      mysql:
        condition: service_healthy

  api:
    build: .
    environment: *app-env
    ports:
      - "${API_PORT:-3000}:3000"
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      migrate:
        condition: service_completed_successfully

volumes:
  mysql-data:
```

Every variable has an inline default, so `docker compose up` works with no
`.env` file at all. The anonymous `/app/node_modules` volume stops the bind
mount from hiding the modules installed in the image.

- [ ] **Step 4: Write `.env.example`**

```dotenv
# Only needed to override the Compose defaults or to run on the host.
NODE_ENV=development
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=ecommerce
DB_USER=products
DB_PASSWORD=products
DB_POOL_MAX=25
```

- [ ] **Step 5: Write `Makefile`**

```makefile
.PHONY: up down logs test e2e migrate seed reset

up:      ; docker compose up --build
down:    ; docker compose down
reset:   ; docker compose down -v
logs:    ; docker compose logs -f api
migrate: ; docker compose run --rm migrate pnpm migrate
seed:    ; docker compose run --rm migrate pnpm seed
test:    ; docker compose run --rm -e DB_NAME=ecommerce_test api sh -c "pnpm test && pnpm test:e2e"
e2e:     ; docker compose run --rm -e DB_NAME=ecommerce_test api pnpm test:e2e
```

- [ ] **Step 6: Verify MySQL starts and both schemas exist**

Run:
```bash
docker compose up -d mysql
docker compose exec mysql mysql -uproducts -pproducts -e "SHOW DATABASES;"
```
Expected: the list contains `ecommerce` and `ecommerce_test`.

If it does not, the data volume predates the init script: run
`docker compose down -v` and repeat.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add compose, image and make targets for the local stack"
```

---

### Task 0.3: Validated configuration

**Files:**
- Create: `jest.config.ts`, `src/config/env.schema.ts`, `src/config/config.module.ts`
- Test: `test/unit/config/env.schema.spec.ts`

- [ ] **Step 0: Write the unit-test Jest configuration**

This is the first task with a unit test, so it is the task that brings Jest.

```ts
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  collectCoverageFrom: ['src/**/*.ts'],
};

export default config;
```

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/config/env.schema.spec.ts
import { validateEnv } from '../../../src/config/env.schema';

const valid = {
  NODE_ENV: 'test', PORT: '3000', DB_HOST: 'mysql', DB_PORT: '3306',
  DB_NAME: 'ecommerce', DB_USER: 'products', DB_PASSWORD: 'products',
  DB_POOL_MAX: '25',
};

describe('validateEnv', () => {
  it('coerces numeric variables to numbers', () => {
    expect(validateEnv(valid).PORT).toBe(3000);
  });

  it('rejects a missing database host', () => {
    const { DB_HOST, ...withoutHost } = valid;
    expect(() => validateEnv(withoutHost)).toThrow(/DB_HOST/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- env.schema`
Expected: FAIL, cannot find module `env.schema`.

- [ ] **Step 3: Write `src/config/env.schema.ts`**

```ts
import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvSchema {
  @IsEnum(NodeEnv) readonly NODE_ENV: NodeEnv = NodeEnv.Development;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) readonly PORT: number = 3000;
  @IsString() @IsNotEmpty() readonly DB_HOST!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) readonly DB_PORT: number = 3306;
  @IsString() @IsNotEmpty() readonly DB_NAME!: string;
  @IsString() @IsNotEmpty() readonly DB_USER!: string;
  @IsString() @IsNotEmpty() readonly DB_PASSWORD!: string;
  // The concurrency test issues twenty parallel requests; a smaller pool would
  // serialise them and the race would never be exercised.
  @Type(() => Number) @IsInt() @Min(1) readonly DB_POOL_MAX: number = 25;
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const parsed = plainToInstance(EnvSchema, raw, { exposeDefaultValues: true });
  const errors = validateSync(parsed, { whitelist: true, forbidUnknownValues: false });
  if (errors.length > 0) {
    const detail = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return parsed;
}
```

- [ ] **Step 4: Write `src/config/config.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { EnvSchema, validateEnv } from './env.schema';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): EnvSchema => validateEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- env.schema`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(config): validate the environment at startup"
```

---

### Task 0.4: Errors and the translation filter

**Files:**
- Create: `src/common/errors/domain-error.ts`, `problem-details.ts`,
  `validation-failed.error.ts`, `infrastructure.errors.ts`,
  `domain-exception.filter.ts`, `src/common/logging/app-logger.ts`
- Test: `test/unit/common/errors/domain-exception.filter.spec.ts`

- [ ] **Step 1: Write `src/common/errors/domain-error.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/common/errors/problem-details.ts`**

```ts
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
```

- [ ] **Step 3: Write `src/common/errors/validation-failed.error.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/common/errors/infrastructure.errors.ts`**

```ts
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
```

- [ ] **Step 5: Write `src/common/logging/app-logger.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';

/** One place to change if the logging backend ever changes. */
@Injectable()
export class AppLogger {
  private readonly logger = new Logger('app');

  info(message: string): void {
    this.logger.log(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  error(message: string, stack?: string): void {
    this.logger.error(message, stack);
  }
}
```

- [ ] **Step 6: Write the failing filter test**

```ts
// test/unit/common/errors/domain-exception.filter.spec.ts
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from '../../../../src/common/errors/domain-exception.filter';
import { DomainError } from '../../../../src/common/errors/domain-error';
import { AppLogger } from '../../../../src/common/logging/app-logger';

class NotFound extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly status = 404;
  readonly title = 'Product not found';
  constructor() { super('No product with that token.'); }
}

function hostFor(url: string) {
  const reply = { status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), send: jest.fn() };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url }), getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  return { host, reply };
}

describe('DomainExceptionFilter', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger;
  const filter = new DomainExceptionFilter(logger);

  it('renders a domain error as problem+json with its code', () => {
    const { host, reply } = hostFor('/products/ABC12345');
    filter.catch(new NotFound(), host);
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.type).toHaveBeenCalledWith('application/problem+json');
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PRODUCT_NOT_FOUND', status: 404, instance: '/products/ABC12345' }),
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
    const body = reply.send.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('connection string leaked');
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm test -- domain-exception.filter`
Expected: FAIL, cannot find module `domain-exception.filter`.

- [ ] **Step 8: Write `src/common/errors/domain-exception.filter.ts`**

```ts
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppLogger } from '../logging/app-logger';
import { DomainError } from './domain-error';
import { PROBLEM_CONTENT_TYPE, buildProblem } from './problem-details';

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
    const instance = http.getRequest<FastifyRequest>().url;
    const reply = http.getResponse<FastifyReply>();

    if (exception instanceof DomainError) {
      const problem = buildProblem({
        status: exception.status,
        title: exception.title,
        code: exception.code,
        detail: exception.message,
        instance,
        extra: exception.extra(),
      });
      void reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
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
      void reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
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
    void reply.status(500).type(PROBLEM_CONTENT_TYPE).send(problem);
  }
}
```

- [ ] **Step 9: Run the tests**

Run: `pnpm test -- domain-exception.filter`
Expected: PASS, 3 tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(errors): translate every failure into RFC 9457 problem+json"
```

---

### Task 0.5: Database providers

**Files:**
- Create: `src/database/database.tokens.ts`, `database.providers.ts`,
  `database.module.ts`

- [ ] **Step 1: Write `src/database/database.tokens.ts`**

```ts
export const SEQUELIZE = Symbol('SEQUELIZE');
export const PRODUCT_MODEL = Symbol('PRODUCT_MODEL');
export const IDEMPOTENCY_MODEL = Symbol('IDEMPOTENCY_MODEL');
```

- [ ] **Step 2: Write `src/database/database.providers.ts`**

```ts
import type { Provider } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { ENV } from '../config/config.module';
import type { EnvSchema } from '../config/env.schema';
import { SEQUELIZE } from './database.tokens';

export const sequelizeProvider: Provider = {
  provide: SEQUELIZE,
  inject: [ENV],
  useFactory: async (env: EnvSchema): Promise<Sequelize> => {
    const sequelize = new Sequelize({
      dialect: 'mysql',
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
      // Without this, timestamps depend on the container's time zone.
      timezone: '+00:00',
      logging: false,
      pool: { max: env.DB_POOL_MAX, min: 0, idle: 10_000 },
    });
    await sequelize.authenticate();
    return sequelize;
  },
};
```

- [ ] **Step 3: Write `src/database/database.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { sequelizeProvider } from './database.providers';
import { SEQUELIZE } from './database.tokens';

@Global()
@Module({ providers: [sequelizeProvider], exports: [SEQUELIZE] })
export class DatabaseModule {}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(database): wire Sequelize through hand-written providers"
```

---

### Task 0.6: Migrations

**Files:**
- Create: `db/umzug.ts`, `db/migrations/001-create-products.ts`,
  `db/migrations/002-create-idempotency-keys.ts`

- [ ] **Step 1: Write `db/umzug.ts`**

```ts
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? 'ecommerce',
  username: process.env.DB_USER ?? 'products',
  password: process.env.DB_PASSWORD ?? 'products',
  logging: false,
});

export const migrator = new Umzug({
  migrations: { glob: ['migrations/*.ts', { cwd: __dirname }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

export type Migration = typeof migrator._types.migration;

if (require.main === module) {
  migrator
    .runAsCLI()
    .then(() => sequelize.close())
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Write `db/migrations/001-create-products.ts`**

```ts
import { DataTypes } from 'sequelize';
import type { Migration } from '../umzug';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('products', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    // Explicitly case-sensitive: MySQL 8.4 defaults to a case-insensitive
    // collation, under which 'SKU-1' and 'sku-1' would collide on the unique key.
    productToken: { type: 'VARCHAR(64) COLLATE utf8mb4_0900_as_cs', allowNull: false, unique: 'uq_products_productToken' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    // Signed on purpose: with UNSIGNED, `stock + :delta >= 0` does unsigned
    // arithmetic and raises ER_DATA_OUT_OF_RANGE instead of not matching.
    stock: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE(3), allowNull: false },
    updatedAt: { type: DataTypes.DATE(3), allowNull: false },
  });
  await queryInterface.sequelize.query(
    'ALTER TABLE products ADD CONSTRAINT ck_products_price CHECK (price >= 0)',
  );
  await queryInterface.sequelize.query(
    'ALTER TABLE products ADD CONSTRAINT ck_products_stock CHECK (stock >= 0)',
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('products');
};
```

- [ ] **Step 3: Write `db/migrations/002-create-idempotency-keys.ts`**

```ts
import { DataTypes } from 'sequelize';
import type { Migration } from '../umzug';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('idempotency_keys', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    idempotencyKey: { type: 'VARCHAR(255) COLLATE utf8mb4_0900_as_cs', allowNull: false, unique: 'uq_idempotency_key' },
    productId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'products', key: 'id' },
      onDelete: 'CASCADE',
    },
    requestHash: { type: DataTypes.CHAR(64), allowNull: false },
    // NULL means the request is still in flight.
    responseStatus: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
    responseBody: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE(3), allowNull: false },
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('idempotency_keys');
};
```

- [ ] **Step 4: Run the migrations**

Run: `docker compose run --rm migrate pnpm migrate`
Expected: two migrations reported as executed, exit 0.

If Node cannot load the `.ts` migration files, the fallback is to run the
runner through the TypeScript compiler: add
`"migrate": "tsc -p tsconfig.json --outDir dist && node dist/db/umzug.js up"`
and install nothing new. Record whichever route you took in the README.

- [ ] **Step 5: Verify the schema**

Run:
```bash
docker compose exec mysql mysql -uproducts -pproducts ecommerce -e "SHOW CREATE TABLE products\G"
```
Expected: `productToken` is `varchar(64)` with collation `utf8mb4_0900_as_cs`,
`stock` is `int`, and both `CHECK` constraints are listed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): create the products and idempotency_keys tables"
```

---

### Task 0.7: Bootstrap, health and the end-to-end harness

**Files:**
- Create: `src/app.setup.ts`, `src/app.module.ts`, `src/main.ts`,
  `src/health/health.controller.ts`, `src/health/health.module.ts`,
  `test/e2e/setup/{global-setup,database,app.factory}.ts`,
  `jest.config.ts`, `jest.e2e.config.ts`
- Test: `test/e2e/health.e2e-spec.ts`

- [ ] **Step 1: Write `src/app.setup.ts`**

```ts
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter';
import { ValidationFailedError } from './common/errors/validation-failed.error';
import { AppLogger } from './common/logging/app-logger';

/** Shared by main.ts and the e2e factory so the two cannot drift apart. */
export function configureApp(app: NestFastifyApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new ValidationFailedError(errors),
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter(app.get(AppLogger)));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Products Service').setVersion('1.0.0').build(),
  );
  SwaggerModule.setup('docs', app, document);
}
```

- [ ] **Step 2: Write `src/health/health.controller.ts`**

```ts
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Sequelize } from 'sequelize';
import { DatabaseUnavailableError } from '../common/errors/infrastructure.errors';
import { SEQUELIZE } from '../database/database.tokens';

@Controller('health')
export class HealthController {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  @Get()
  @ApiOperation({ summary: 'Liveness of the service and of its database' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.sequelize.query('SELECT 1');
    } catch {
      throw new DatabaseUnavailableError();
    }
    return { status: 'ok' };
  }
}
```

- [ ] **Step 3: Write `src/health/health.module.ts` and `src/app.module.ts`**

```ts
// src/health/health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppLogger } from './common/logging/app-logger';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppModule {}
```

- [ ] **Step 4: Write `src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ENV } from './config/config.module';
import type { EnvSchema } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  configureApp(app);
  const env = app.get<EnvSchema>(ENV);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

void bootstrap();
```

- [ ] **Step 5: Write the end-to-end Jest configuration**

`jest.config.ts` already exists — Task 0.3 brought it, since that is where the
first unit test appeared. This task adds only its end-to-end counterpart.

```ts
// jest.e2e.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/e2e'],
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.ts',
  testTimeout: 30_000,
};

export default config;
```

- [ ] **Step 6: Write the end-to-end harness**

```ts
// test/e2e/setup/global-setup.ts
import { Sequelize } from 'sequelize';
import { migrator } from '../../../db/umzug';

async function waitForDatabase(): Promise<void> {
  // MySQL accepts TCP before it accepts queries; retry rather than assume.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const sequelize = new Sequelize({
      dialect: 'mysql',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 3307),
      database: process.env.DB_NAME ?? 'ecommerce_test',
      username: process.env.DB_USER ?? 'products',
      password: process.env.DB_PASSWORD ?? 'products',
      logging: false,
    });
    try {
      await sequelize.authenticate();
      await sequelize.close();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('The database did not become available in time.');
}

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME ??= 'ecommerce_test';
  await waitForDatabase();
  await migrator.up();
}
```

```ts
// test/e2e/setup/database.ts
import { Sequelize } from 'sequelize';

/**
 * DELETE, not TRUNCATE: MySQL refuses to truncate a table referenced by a
 * foreign key, even when the referencing table is empty.
 */
export async function resetDatabase(sequelize: Sequelize): Promise<void> {
  await sequelize.query('DELETE FROM idempotency_keys');
  await sequelize.query('DELETE FROM products');
  await sequelize.query('ALTER TABLE products AUTO_INCREMENT = 1');
}
```

```ts
// test/e2e/setup/app.factory.ts
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.setup';

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApp(app);
  await app.init();
  // Without this the Fastify routes are not registered yet and every request 404s.
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
```

- [ ] **Step 7: Write the failing health test**

```ts
// test/e2e/health.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './setup/app.factory';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it('reports ok when the database answers', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers an unknown route in problem+json', async () => {
    const response = await request(app.getHttpServer()).get('/nope');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
```

- [ ] **Step 8: Run the end-to-end suite**

Run: `make e2e`
Expected: PASS, 2 tests.

If Swagger's UI assets 404 at `/docs`, install `@fastify/static` and re-run —
this is the risk recorded in the design.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(health): bootstrap the app and add the health endpoint"
```

---
# Slice 1 — Create a product

At the end of this slice `POST /products` works, with validation, the duplicate
token conflict, and both kinds of test.

### Task 1.1: Module vocabulary

**Files:**
- Create: `src/products/product.ts`, `src/products/products.constants.ts`,
  `src/products/products.errors.ts`

- [ ] **Step 1: Write `src/products/product.ts`**

```ts
/** What the repository returns and the service works with. Never the model. */
export interface Product {
  readonly productToken: string;
  readonly name: string;
  readonly price: string;
  readonly stock: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewProduct {
  readonly productToken: string;
  readonly name: string;
  readonly price: string;
  readonly stock: number;
}

export interface PageMeta {
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: PageMeta;
}
```

- [ ] **Step 2: Write `src/products/products.constants.ts`**

```ts
export const PRODUCT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** DECIMAL(10,2): eight integer digits, at most two decimals. */
export const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const INT_MAX = 2_147_483_647;
export const IDEMPOTENCY_RETENTION_HOURS = 24;
/** InnoDB waits 50s by default; the client would give up long before the 409. */
export const STOCK_LOCK_WAIT_SECONDS = 3;
```

- [ ] **Step 3: Write `src/products/products.errors.ts`**

```ts
import { DomainError } from '../common/errors/domain-error';

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  readonly status = 404;
  readonly title = 'Product not found';

  constructor(productToken: string) {
    super(`No product exists with token ${productToken}.`);
  }
}

export class ProductTokenAlreadyExistsError extends DomainError {
  readonly code = 'PRODUCT_TOKEN_ALREADY_EXISTS';
  readonly status = 409;
  readonly title = 'Product token already exists';

  constructor(productToken: string) {
    super(`A product with token ${productToken} already exists.`);
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly status = 409;
  readonly title = 'Insufficient stock';

  constructor(private readonly available: number) {
    super('Stock cannot go below zero.');
  }

  /** Advisory and point-in-time: a concurrent request may change it. */
  extra(): Record<string, unknown> {
    return { available: this.available };
  }
}

export class StockLimitExceededError extends DomainError {
  readonly code = 'STOCK_LIMIT_EXCEEDED';
  readonly status = 409;
  readonly title = 'Stock limit exceeded';

  constructor() {
    super('Stock cannot exceed the maximum a signed integer can hold.');
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(products): define the module's types, constants and errors"
```

---

### Task 1.2: The Sequelize model

**Files:**
- Create: `src/products/repository/models/product.model.ts`

- [ ] **Step 1: Write the model and its provider**

```ts
import type { Provider } from '@nestjs/common';
import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { PRODUCT_MODEL } from '../../../database/database.tokens';
import { SEQUELIZE } from '../../../database/database.tokens';
import type { Product } from '../../product';

export class ProductModel extends Model<
  InferAttributes<ProductModel>,
  InferCreationAttributes<ProductModel>
> {
  declare id: CreationOptional<number>;
  declare productToken: string;
  declare name: string;
  declare price: string;
  declare stock: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initProductModel(sequelize: Sequelize): typeof ProductModel {
  ProductModel.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      productToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      // mysql2 hands DECIMAL back as a string, which is exactly what we want.
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      stock: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: DataTypes.DATE(3),
      updatedAt: DataTypes.DATE(3),
    },
    { sequelize, tableName: 'products', timestamps: true },
  );
  return ProductModel;
}

/** `id` is deliberately absent: it must never leave the repository. */
export function toProduct(row: ProductModel): Product {
  return {
    productToken: row.productToken,
    name: row.name,
    price: row.price,
    stock: row.stock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const productModelProvider: Provider = {
  provide: PRODUCT_MODEL,
  inject: [SEQUELIZE],
  useFactory: (sequelize: Sequelize): typeof ProductModel => initProductModel(sequelize),
};
```

The provider lives in this file so that `products.module.ts` never has to
import `sequelize`, which the lint rule forbids outside `repository/`.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(products): define the Sequelize product model and its mapper"
```

---

### Task 1.3: Repository create

**Files:**
- Create: `src/products/repository/product.repository.ts`
- Test: `test/unit/products/product.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/products/product.repository.spec.ts
import { UniqueConstraintError } from 'sequelize';
import { ProductRepository } from '../../../src/products/repository/product.repository';
import type { ProductModel } from '../../../src/products/repository/models/product.model';
import { ProductTokenAlreadyExistsError } from '../../../src/products/products.errors';

const row = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
  createdAt: new Date('2026-08-14T10:00:00.000Z'),
  updatedAt: new Date('2026-08-14T10:00:00.000Z'),
};

function modelMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn().mockResolvedValue(row),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  } as unknown as typeof ProductModel;
}

describe('ProductRepository.create', () => {
  it('returns the created product without its id', async () => {
    const repository = new ProductRepository(modelMock());
    const product = await repository.create({ ...row });
    expect(product).toEqual(row);
    expect(product).not.toHaveProperty('id');
  });

  it('translates a unique violation into a domain error', async () => {
    const model = modelMock({
      create: jest.fn().mockRejectedValue(new UniqueConstraintError({})),
    });
    const repository = new ProductRepository(model);
    await expect(repository.create({ ...row })).rejects.toBeInstanceOf(ProductTokenAlreadyExistsError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- product.repository`
Expected: FAIL, cannot find module `product.repository`.

- [ ] **Step 3: Write `src/products/repository/product.repository.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { UniqueConstraintError } from 'sequelize';
import { PRODUCT_MODEL } from '../../database/database.tokens';
import type { NewProduct, Product } from '../product';
import { ProductTokenAlreadyExistsError } from '../products.errors';
import { ProductModel, toProduct } from './models/product.model';

@Injectable()
export class ProductRepository {
  constructor(@Inject(PRODUCT_MODEL) private readonly model: typeof ProductModel) {}

  async create(input: NewProduct): Promise<Product> {
    try {
      const row = await this.model.create({ ...input });
      return toProduct(row);
    } catch (error) {
      // Sequelize wraps MySQL's ER_DUP_ENTRY; the layer that knows the driver translates it.
      if (error instanceof UniqueConstraintError) {
        throw new ProductTokenAlreadyExistsError(input.productToken);
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- product.repository`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): add the repository create with duplicate translation"
```

---

### Task 1.4: Service create

**Files:**
- Create: `src/products/service/products.service.ts`
- Test: `test/unit/products/products.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/products/products.service.spec.ts
import { ProductsService } from '../../../src/products/service/products.service';
import type { ProductRepository } from '../../../src/products/repository/product.repository';

const product = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
  createdAt: new Date('2026-08-14T10:00:00.000Z'),
  updatedAt: new Date('2026-08-14T10:00:00.000Z'),
};

function repositoryMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn().mockResolvedValue(product),
    findByToken: jest.fn(),
    findPage: jest.fn(),
    deleteByToken: jest.fn(),
    ...overrides,
  } as unknown as ProductRepository;
}

describe('ProductsService.create', () => {
  it('passes the input through and returns the stored product', async () => {
    const repository = repositoryMock();
    const service = new ProductsService(repository);
    const created = await service.create({
      productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10,
    });
    expect(created).toEqual(product);
    expect(repository.create).toHaveBeenCalledWith({
      productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10,
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- products.service`
Expected: FAIL, cannot find module `products.service`.

- [ ] **Step 3: Write `src/products/service/products.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { NewProduct, Product } from '../product';
import { ProductRepository } from '../repository/product.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductRepository) {}

  async create(input: NewProduct): Promise<Product> {
    return this.products.create(input);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- products.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): add the service create"
```

---

### Task 1.5: The create endpoint

**Files:**
- Create: `src/products/controller/dto/transformers.ts`,
  `dto/create-product.dto.ts`, `src/products/controller/product.response.ts`,
  `src/products/controller/products.controller.ts`,
  `src/products/products.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/e2e/products.create.e2e-spec.ts`

- [ ] **Step 1: Write the transformers**

```ts
// src/products/controller/dto/transformers.ts
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
```

- [ ] **Step 2: Write the create DTO**

```ts
// src/products/controller/dto/create-product.dto.ts
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INT_MAX, PRICE_PATTERN, PRODUCT_TOKEN_PATTERN } from '../../products.constants';

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-000123' })
  @Matches(PRODUCT_TOKEN_PATTERN, { message: 'productToken must be 8-64 URL-safe characters' })
  readonly productToken!: string;

  @ApiProperty({ example: 'Blue cotton shirt' })
  @Transform(trimValue)
  @IsString()
  @Length(1, 255)
  readonly name!: string;

  @ApiProperty({ type: String, example: '19.99' })
  @Transform(toDecimalString)
  @Matches(PRICE_PATTERN, { message: 'price must have at most 8 integer digits and 2 decimals' })
  readonly price!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  readonly stock!: number;
}
```

Add the two transformer imports at the top:
`import { toDecimalString, trimValue } from './transformers';`

- [ ] **Step 3: Write the response type**

```ts
// src/products/controller/product.response.ts
import { ApiProperty } from '@nestjs/swagger';
import type { PageMeta, Product } from '../product';

export class ProductResponse {
  @ApiProperty({ example: 'SKU-000123' }) readonly productToken: string;
  @ApiProperty({ example: 'Blue cotton shirt' }) readonly name: string;
  @ApiProperty({ type: String, example: '19.99' }) readonly price: string;
  @ApiProperty({ example: 10 }) readonly stock: number;
  @ApiProperty({ example: '2026-08-14T10:00:00.000Z' }) readonly createdAt: string;
  @ApiProperty({ example: '2026-08-14T10:00:00.000Z' }) readonly updatedAt: string;

  private constructor(product: Product) {
    this.productToken = product.productToken;
    this.name = product.name;
    this.price = product.price;
    this.stock = product.stock;
    this.createdAt = product.createdAt.toISOString();
    this.updatedAt = product.updatedAt.toISOString();
  }

  /** Explicit field by field, so a new column cannot leak into the API. */
  static from(product: Product): ProductResponse {
    return new ProductResponse(product);
  }
}

export interface DataResponse<T> {
  readonly data: T;
}

export interface PagedResponse<T> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}
```

- [ ] **Step 4: Write the controller**

```ts
// src/products/controller/products.controller.ts
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ProductsService } from '../service/products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponse, type DataResponse } from './product.response';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ type: ProductResponse })
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DataResponse<ProductResponse>> {
    const product = await this.products.create(dto);
    void reply.header('Location', `/products/${product.productToken}`);
    return { data: ProductResponse.from(product) };
  }
}
```

- [ ] **Step 5: Write the module and register it**

```ts
// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { ProductsController } from './controller/products.controller';
import { productModelProvider } from './repository/models/product.model';
import { ProductRepository } from './repository/product.repository';
import { ProductsService } from './service/products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository, productModelProvider],
})
export class ProductsModule {}
```

In `src/app.module.ts`, add `ProductsModule` to `imports`.

- [ ] **Step 6: Write the end-to-end test**

```ts
// test/e2e/products.create.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

const body = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
};

describe('POST /products', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await resetDatabase(app.get<Sequelize>(SEQUELIZE)); });
  afterAll(async () => { await app.close(); });

  it('creates a product and points at it with Location', async () => {
    const response = await request(app.getHttpServer()).post('/products').send(body);
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/products/SKU-000123');
    expect(response.body.data).toMatchObject({ productToken: 'SKU-000123', price: '19.99', stock: 10 });
    expect(response.body.data).not.toHaveProperty('id');
  });

  it('rejects a duplicate token with 409', async () => {
    await request(app.getHttpServer()).post('/products').send(body);
    const response = await request(app.getHttpServer()).post('/products').send(body);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PRODUCT_TOKEN_ALREADY_EXISTS');
  });

  it('rejects a price with three decimals', async () => {
    const response = await request(app.getHttpServer()).post('/products').send({ ...body, price: '19.999' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unknown field', async () => {
    const response = await request(app.getHttpServer()).post('/products').send({ ...body, discount: 5 });
    expect(response.status).toBe(400);
  });

  it('rejects a name made only of whitespace', async () => {
    const response = await request(app.getHttpServer()).post('/products').send({ ...body, name: '   ' });
    expect(response.status).toBe(400);
  });

  it('answers malformed JSON in problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Content-Type', 'application/json')
      .send('{"productToken":');
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
```

- [ ] **Step 7: Run the suite**

Run: `make e2e`
Expected: PASS, 8 tests including the two from health.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(products): add the create endpoint with validation and 409"
```

---

# Slice 2 — Read a product and list them

### Task 2.1: Repository reads

**Files:**
- Modify: `src/products/repository/product.repository.ts`
- Modify: `test/unit/products/product.repository.spec.ts`

- [ ] **Step 1: Add the failing tests**

```ts
describe('ProductRepository reads', () => {
  it('returns null when no product has that token', async () => {
    const model = modelMock({ findOne: jest.fn().mockResolvedValue(null) });
    const repository = new ProductRepository(model);
    await expect(repository.findByToken('SKU-000123')).resolves.toBeNull();
  });

  it('derives the offset from the page and orders by id', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [row], count: 42 });
    const repository = new ProductRepository(modelMock({ findAndCountAll }));
    const page = await repository.findPage(3, 20);
    expect(findAndCountAll).toHaveBeenCalledWith({
      order: [['id', 'ASC']],
      offset: 40,
      limit: 20,
    });
    expect(page.total).toBe(42);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test -- product.repository`
Expected: FAIL, `findByToken is not a function`.

- [ ] **Step 3: Add the methods to the repository**

```ts
  async findByToken(productToken: string): Promise<Product | null> {
    const row = await this.model.findOne({ where: { productToken } });
    return row === null ? null : toProduct(row);
  }

  async findPage(page: number, size: number): Promise<{ items: Product[]; total: number }> {
    // The order is not decoration: without it MySQL may return rows in any
    // order and two pages could repeat or skip a product.
    const { rows, count } = await this.model.findAndCountAll({
      order: [['id', 'ASC']],
      offset: (page - 1) * size,
      limit: size,
    });
    return { items: rows.map(toProduct), total: count };
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- product.repository`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): read one product and a page of products"
```

---

### Task 2.2: Service reads

**Files:**
- Modify: `src/products/service/products.service.ts`
- Modify: `test/unit/products/products.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

```ts
describe('ProductsService reads', () => {
  it('raises ProductNotFound when the repository has nothing', async () => {
    const service = new ProductsService(repositoryMock({ findByToken: jest.fn().mockResolvedValue(null) }));
    await expect(service.get('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('computes totalPages as a ceiling division', async () => {
    const findPage = jest.fn().mockResolvedValue({ items: [product], total: 41 });
    const service = new ProductsService(repositoryMock({ findPage }));
    const page = await service.list(1, 20);
    expect(page.meta).toEqual({ page: 1, size: 20, total: 41, totalPages: 3 });
  });
});
```

Add `import { ProductNotFoundError } from '../../../src/products/products.errors';` to the test file.

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test -- products.service`
Expected: FAIL, `service.get is not a function`.

- [ ] **Step 3: Add the methods to the service**

```ts
  async get(productToken: string): Promise<Product> {
    const product = await this.products.findByToken(productToken);
    if (product === null) {
      throw new ProductNotFoundError(productToken);
    }
    return product;
  }

  async list(page: number, size: number): Promise<Page<Product>> {
    const { items, total } = await this.products.findPage(page, size);
    return { items, meta: { page, size, total, totalPages: Math.ceil(total / size) } };
  }
```

Import `Page` from `../product` and `ProductNotFoundError` from `../products.errors`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- products.service`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): add the service reads and page metadata"
```

---

### Task 2.3: The read endpoints

**Files:**
- Create: `src/products/controller/dto/product-token.param.ts`,
  `dto/list-products.query.ts`
- Modify: `src/products/controller/products.controller.ts`
- Test: `test/e2e/products.read.e2e-spec.ts`

- [ ] **Step 1: Write the two DTOs**

```ts
// src/products/controller/dto/product-token.param.ts
import { Matches } from 'class-validator';
import { PRODUCT_TOKEN_PATTERN } from '../../products.constants';

export class ProductTokenParam {
  @Matches(PRODUCT_TOKEN_PATTERN, { message: 'productToken must be 8-64 URL-safe characters' })
  readonly productToken!: string;
}
```

```ts
// src/products/controller/dto/list-products.query.ts
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../products.constants';

export class ListProductsQuery {
  @ApiPropertyOptional({ default: DEFAULT_PAGE, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly size: number = DEFAULT_PAGE_SIZE;
}
```

- [ ] **Step 2: Add the endpoints to the controller**

```ts
  @Get()
  @ApiOkResponse({ type: ProductResponse, isArray: true })
  async list(@Query() query: ListProductsQuery): Promise<PagedResponse<ProductResponse>> {
    const page = await this.products.list(query.page, query.size);
    return { data: page.items.map(ProductResponse.from), meta: page.meta };
  }

  @Get(':productToken')
  @ApiOkResponse({ type: ProductResponse })
  async get(@Param() params: ProductTokenParam): Promise<DataResponse<ProductResponse>> {
    return { data: ProductResponse.from(await this.products.get(params.productToken)) };
  }
```

Import `Get`, `Param`, `Query` from `@nestjs/common`, `ApiOkResponse` from
`@nestjs/swagger`, both DTOs, and `PagedResponse` from `./product.response`.

The list route is declared before `:productToken` so that `/products` is not
captured by the parameterised route.

- [ ] **Step 3: Write the end-to-end test**

```ts
// test/e2e/products.read.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

function productBody(index: number) {
  return {
    productToken: `SKU-${String(index).padStart(6, '0')}`,
    name: `Product ${index}`,
    price: '10.00',
    stock: 5,
  };
}

describe('GET /products', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await resetDatabase(app.get<Sequelize>(SEQUELIZE)); });
  afterAll(async () => { await app.close(); });

  it('returns one product', async () => {
    await request(app.getHttpServer()).post('/products').send(productBody(1));
    const response = await request(app.getHttpServer()).get('/products/SKU-000001');
    expect(response.status).toBe(200);
    expect(response.body.data.productToken).toBe('SKU-000001');
  });

  it('answers 404 for a token that does not exist', async () => {
    const response = await request(app.getHttpServer()).get('/products/SKU-999999');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('answers 400 for a malformed token', async () => {
    const response = await request(app.getHttpServer()).get('/products/short');
    expect(response.status).toBe(400);
  });

  it('covers every product exactly once across two pages', async () => {
    for (let index = 1; index <= 5; index += 1) {
      await request(app.getHttpServer()).post('/products').send(productBody(index));
    }
    const first = await request(app.getHttpServer()).get('/products?page=1&size=3');
    const second = await request(app.getHttpServer()).get('/products?page=2&size=3');

    expect(first.body.meta).toEqual({ page: 1, size: 3, total: 5, totalPages: 2 });
    const tokens = [...first.body.data, ...second.body.data].map((item: { productToken: string }) => item.productToken);
    expect(new Set(tokens).size).toBe(5);
  });

  it('returns an empty page past the last one', async () => {
    const response = await request(app.getHttpServer()).get('/products?page=99&size=20');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('rejects a page size above the maximum', async () => {
    const response = await request(app.getHttpServer()).get('/products?size=500');
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `make e2e`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): add the read and paginated list endpoints"
```

---

# Slice 3 — Delete a product

### Task 3.1: Delete end to end

**Files:**
- Modify: `src/products/repository/product.repository.ts`,
  `src/products/service/products.service.ts`,
  `src/products/controller/products.controller.ts`
- Modify: `test/unit/products/product.repository.spec.ts`,
  `test/unit/products/products.service.spec.ts`
- Test: `test/e2e/products.delete.e2e-spec.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
// in test/unit/products/product.repository.spec.ts
describe('ProductRepository.deleteByToken', () => {
  it('reports false when nothing was deleted', async () => {
    const repository = new ProductRepository(modelMock({ destroy: jest.fn().mockResolvedValue(0) }));
    await expect(repository.deleteByToken('SKU-000123')).resolves.toBe(false);
  });
});
```

```ts
// in test/unit/products/products.service.spec.ts
describe('ProductsService.remove', () => {
  it('raises ProductNotFound when nothing was deleted', async () => {
    const service = new ProductsService(repositoryMock({ deleteByToken: jest.fn().mockResolvedValue(false) }));
    await expect(service.remove('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test`
Expected: FAIL, `deleteByToken is not a function`.

- [ ] **Step 3: Implement all three layers**

```ts
// repository
  async deleteByToken(productToken: string): Promise<boolean> {
    const affected = await this.model.destroy({ where: { productToken } });
    return affected > 0;
  }
```

```ts
// service
  async remove(productToken: string): Promise<void> {
    const deleted = await this.products.deleteByToken(productToken);
    if (!deleted) {
      throw new ProductNotFoundError(productToken);
    }
  }
```

```ts
// controller
  @Delete(':productToken')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@Param() params: ProductTokenParam): Promise<void> {
    await this.products.remove(params.productToken);
  }
```

Import `Delete` from `@nestjs/common` and `ApiNoContentResponse` from `@nestjs/swagger`.

- [ ] **Step 4: Write the end-to-end test**

```ts
// test/e2e/products.delete.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };

describe('DELETE /products/:productToken', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await resetDatabase(app.get<Sequelize>(SEQUELIZE)); });
  afterAll(async () => { await app.close(); });

  it('deletes the product and then cannot find it', async () => {
    await request(app.getHttpServer()).post('/products').send(body);
    const deleted = await request(app.getHttpServer()).delete('/products/SKU-000123');
    expect(deleted.status).toBe(204);

    const missing = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect(missing.status).toBe(404);
  });

  it('answers 404 when the product is already gone', async () => {
    const response = await request(app.getHttpServer()).delete('/products/SKU-000123');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  });
});
```

- [ ] **Step 5: Run everything**

Run: `make test`
Expected: unit and e2e both green; 16 e2e tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(products): add the delete endpoint"
```

**Checkpoint.** From here the repository is a valid submission: full CRUD minus
the stock update, validated, tested, documented by Swagger. Everything that
follows increases quality; nothing that follows is required for it to stand up.

---
# Slice 4 — Update stock atomically

The core of the service. At the end of this slice a stock change is one
conditional statement, and twenty parallel requests against ten units end at
zero with exactly ten winners.

### Task 4.1: Transaction runner and the ORM boundary

**Files:**
- Create: `src/database/transaction.runner.ts`
- Modify: `src/database/database.module.ts`, `eslint.config.mjs`

The service owns transactions but must not use the ORM. Two changes make both
true at once: a runner that lives in `database/`, where `sequelize` is allowed,
and a lint rule that lets any layer *name* the `Transaction` type while still
refusing the ORM's runtime values.

- [ ] **Step 1: Write the runner**

```ts
// src/database/transaction.runner.ts
import { Inject, Injectable } from '@nestjs/common';
import { Sequelize, type Transaction } from 'sequelize';
import { SEQUELIZE } from './database.tokens';

@Injectable()
export class TransactionRunner {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(work);
  }
}
```

- [ ] **Step 2: Export it from the database module**

Add `TransactionRunner` to both `providers` and `exports` of
`src/database/database.module.ts`.

- [ ] **Step 3: Swap the lint rule for the type-aware one**

In `eslint.config.mjs`, replace the `no-restricted-imports` entry with:

```js
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: 'sequelize',
          allowTypeImports: true,
          message: 'The ORM may only be used under repository/ or database/. A type-only import is fine.',
        }],
      }],
```

and remove the plain `no-restricted-imports` rule. The service may now write
`import type { Transaction } from 'sequelize'` — erased at compile time — but
importing `Sequelize`, `Op` or `QueryTypes` still fails the build.

- [ ] **Step 4: Verify the rule bites**

Add `import { Op } from 'sequelize';` temporarily to
`src/products/service/products.service.ts`.

Run: `pnpm lint`
Expected: FAIL on that line. Remove the import and re-run; expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(database): add the transaction runner and tighten the ORM boundary"
```

---

### Task 4.2: The conditional update

**Files:**
- Modify: `src/products/repository/product.repository.ts`
- Modify: `test/unit/products/product.repository.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// in test/unit/products/product.repository.spec.ts
import { QueryTypes } from 'sequelize';
import { ConcurrentModificationError } from '../../../src/common/errors/infrastructure.errors';

function sequelizeMock(query: jest.Mock) {
  return { query } as unknown as import('sequelize').Sequelize;
}

describe('ProductRepository.applyStockDelta', () => {
  it('guards both bounds inside the WHERE clause', async () => {
    const query = jest.fn().mockResolvedValue([undefined, 1]);
    const repository = new ProductRepository(modelMock(), sequelizeMock(query));
    const affected = await repository.applyStockDelta('SKU-000123', -3, {} as never);

    expect(affected).toBe(1);
    const [sql, options] = query.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toContain('stock + :delta >= 0');
    expect(sql).toContain('stock + :delta <= :intMax');
    expect(options.replacements).toMatchObject({ delta: -3, productToken: 'SKU-000123' });
  });

  it('translates a lock wait timeout into a concurrency error', async () => {
    const lockError = Object.assign(new Error('lock'), { original: { code: 'ER_LOCK_WAIT_TIMEOUT' } });
    const query = jest.fn().mockRejectedValue(lockError);
    const repository = new ProductRepository(modelMock(), sequelizeMock(query));
    await expect(repository.applyStockDelta('SKU-000123', -3, {} as never))
      .rejects.toBeInstanceOf(ConcurrentModificationError);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test -- product.repository`
Expected: FAIL, the constructor takes one argument.

- [ ] **Step 3: Extend the repository**

Change the constructor and add the three methods:

```ts
import { QueryTypes, Sequelize, UniqueConstraintError, type Transaction } from 'sequelize';
import { ConcurrentModificationError } from '../../common/errors/infrastructure.errors';
import { INT_MAX } from '../products.constants';
import { SEQUELIZE } from '../../database/database.tokens';

@Injectable()
export class ProductRepository {
  constructor(
    @Inject(PRODUCT_MODEL) private readonly model: typeof ProductModel,
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  /** InnoDB waits 50 seconds by default; the client gives up long before that. */
  async setLockWaitTimeout(transaction: Transaction, seconds: number): Promise<void> {
    await this.sequelize.query('SET SESSION innodb_lock_wait_timeout = :seconds', {
      replacements: { seconds },
      transaction,
    });
  }

  /**
   * One statement, so two concurrent callers cannot both win the last unit.
   * Returns the number of rows changed: zero means the guard rejected it.
   */
  async applyStockDelta(productToken: string, delta: number, transaction: Transaction): Promise<number> {
    try {
      const [, affected] = await this.sequelize.query(
        `UPDATE products
            SET stock = stock + :delta, updatedAt = :now
          WHERE productToken = :productToken
            AND stock + :delta >= 0
            AND stock + :delta <= :intMax`,
        {
          replacements: { delta, now: new Date(), productToken, intMax: INT_MAX },
          transaction,
          type: QueryTypes.UPDATE,
        },
      );
      return affected;
    } catch (error) {
      if (isLockError(error)) {
        throw new ConcurrentModificationError();
      }
      throw error;
    }
  }

  /**
   * A locking read: under REPEATABLE READ a plain SELECT reads a snapshot and
   * could report a value from before the concurrent commit.
   */
  async findStockForUpdate(productToken: string, transaction: Transaction): Promise<number | null> {
    const rows = await this.sequelize.query<{ stock: number }>(
      'SELECT stock FROM products WHERE productToken = :productToken FOR UPDATE',
      { replacements: { productToken }, transaction, type: QueryTypes.SELECT },
    );
    const [first] = rows;
    return first === undefined ? null : first.stock;
  }
}

interface DriverError {
  readonly original?: { readonly code?: string };
}

function isLockError(error: unknown): boolean {
  const code = (error as DriverError).original?.code;
  return code === 'ER_LOCK_WAIT_TIMEOUT' || code === 'ER_LOCK_DEADLOCK';
}
```

Also give `findByToken` an optional transaction so the service can read the
updated row inside the same transaction:

```ts
  async findByToken(productToken: string, transaction?: Transaction): Promise<Product | null> {
    const row = await this.model.findOne({ where: { productToken }, transaction });
    return row === null ? null : toProduct(row);
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- product.repository`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): apply a stock delta with one conditional update"
```

---

### Task 4.3: Service stock change

**Files:**
- Modify: `src/products/service/products.service.ts`
- Modify: `test/unit/products/products.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// in test/unit/products/products.service.spec.ts
import { InsufficientStockError, StockLimitExceededError } from '../../../src/products/products.errors';
import type { TransactionRunner } from '../../../src/database/transaction.runner';

const runner = {
  run: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
} as unknown as TransactionRunner;

function stockRepositoryMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return repositoryMock({
    setLockWaitTimeout: jest.fn().mockResolvedValue(undefined),
    applyStockDelta: jest.fn().mockResolvedValue(1),
    findStockForUpdate: jest.fn(),
    findByToken: jest.fn().mockResolvedValue({ ...product, stock: 7 }),
    ...overrides,
  });
}

describe('ProductsService.changeStock', () => {
  it('returns the updated product when the guard passes', async () => {
    const service = new ProductsService(stockRepositoryMock(), runner);
    await expect(service.changeStock('SKU-000123', -3)).resolves.toMatchObject({ stock: 7 });
  });

  it('reports the available stock when the delta would go below zero', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(2),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', -3)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('raises the limit error when a positive delta would overflow', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(2_147_483_646),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', 5)).rejects.toBeInstanceOf(StockLimitExceededError);
  });

  it('raises ProductNotFound when the row is gone', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(null),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', -1)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm test -- products.service`
Expected: FAIL, the constructor takes one argument.

- [ ] **Step 3: Extend the service**

```ts
import { TransactionRunner } from '../../database/transaction.runner';
import { STOCK_LOCK_WAIT_SECONDS } from '../products.constants';
import { InsufficientStockError, StockLimitExceededError } from '../products.errors';

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async changeStock(productToken: string, delta: number): Promise<Product> {
    return this.transactions.run(async (transaction) => {
      await this.products.setLockWaitTimeout(transaction, STOCK_LOCK_WAIT_SECONDS);

      const affected = await this.products.applyStockDelta(productToken, delta, transaction);
      if (affected === 0) {
        // Zero rows means the guard rejected it — or the product is not there.
        const stock = await this.products.findStockForUpdate(productToken, transaction);
        if (stock === null) {
          throw new ProductNotFoundError(productToken);
        }
        throw delta < 0 ? new InsufficientStockError(stock) : new StockLimitExceededError();
      }

      // MySQL has no UPDATE ... RETURNING, so the new state is read back.
      const product = await this.products.findByToken(productToken, transaction);
      if (product === null) {
        throw new ProductNotFoundError(productToken);
      }
      return product;
    });
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- products.service`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): change stock inside a transaction with typed failures"
```

---

### Task 4.4: The stock endpoint and the concurrency proof

**Files:**
- Create: `src/products/controller/dto/update-stock.dto.ts`
- Modify: `src/products/controller/products.controller.ts`
- Test: `test/e2e/products.stock.e2e-spec.ts`,
  `test/e2e/products.stock-concurrency.e2e-spec.ts`

- [ ] **Step 1: Write the DTO**

```ts
// src/products/controller/dto/update-stock.dto.ts
import { IsInt, Max, Min, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INT_MAX } from '../../products.constants';

export class UpdateStockDto {
  @ApiProperty({ example: -3, description: 'Non-zero signed change in stock' })
  @IsInt()
  // Zero would affect no rows and be indistinguishable from a rejected guard.
  @NotEquals(0)
  @Min(-INT_MAX)
  @Max(INT_MAX)
  readonly delta!: number;
}
```

- [ ] **Step 2: Add the endpoint**

```ts
  @Patch(':productToken/stock')
  @ApiOkResponse({ type: ProductResponse })
  async changeStock(
    @Param() params: ProductTokenParam,
    @Body() dto: UpdateStockDto,
  ): Promise<DataResponse<ProductResponse>> {
    const product = await this.products.changeStock(params.productToken, dto.delta);
    return { data: ProductResponse.from(product) };
  }
```

Import `Patch` from `@nestjs/common` and `UpdateStockDto`.

- [ ] **Step 3: Write the behaviour test**

```ts
// test/e2e/products.stock.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };

describe('PATCH /products/:productToken/stock', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await resetDatabase(app.get<Sequelize>(SEQUELIZE));
    await request(app.getHttpServer()).post('/products').send(body);
  });
  afterAll(async () => { await app.close(); });

  it('applies a negative delta', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock').send({ delta: -3 });
    expect(response.status).toBe(200);
    expect(response.body.data.stock).toBe(7);
  });

  it('refuses to go below zero and leaves the row untouched', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock').send({ delta: -11 });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('INSUFFICIENT_STOCK');
    expect(response.body.available).toBe(10);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect(after.body.data.stock).toBe(10);
  });

  it('rejects a zero delta', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock').send({ delta: 0 });
    expect(response.status).toBe(400);
  });

  it('rejects a delta sent as a string', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock').send({ delta: '5' });
    expect(response.status).toBe(400);
  });

  it('answers 404 for a product that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-999999/stock').send({ delta: -1 });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 4: Write the concurrency test**

```ts
// test/e2e/products.stock-concurrency.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

describe('concurrent stock decrements', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await resetDatabase(app.get<Sequelize>(SEQUELIZE)); });
  afterAll(async () => { await app.close(); });

  it('lets exactly ten of twenty requests take the last ten units', async () => {
    await request(app.getHttpServer()).post('/products').send({
      productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10,
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer()).patch('/products/SKU-000123/stock').send({ delta: -1 }),
      ),
    );

    const applied = responses.filter((response) => response.status === 200).length;
    const rejected = responses.filter((response) => response.status === 409).length;
    expect(applied).toBe(10);
    expect(rejected).toBe(10);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect(after.body.data.stock).toBe(0);
  });
});
```

This test only proves anything if the pool can hold twenty connections at once
— `DB_POOL_MAX` defaults to 25 for that reason. With a pool of five the
requests would run in four waves, the assertion would still pass, and the race
would never have happened.

- [ ] **Step 5: Run the suite**

Run: `make test`
Expected: unit and e2e green; the concurrency test passes on repeated runs.

Run it five times: `for i in 1 2 3 4 5; do make e2e || break; done`
Expected: five green runs. A flake here means the lock wait timeout is too low
for the machine; raise `STOCK_LOCK_WAIT_SECONDS` rather than weakening the
assertion.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(products): add the atomic stock endpoint and prove it under load"
```

---

# Slice 5 — Idempotent stock requests

**This slice is the one that may be dropped.** If Sunday arrives and it is not
solid, stop here, delete the `idempotency_keys` migration, and note the header
in the README as a planned evolution. Everything before this point stands on
its own.

### Task 5.1: The idempotency repository

**Files:**
- Create: `src/products/repository/models/idempotency-key.model.ts`,
  `src/products/repository/idempotency.repository.ts`
- Test: `test/unit/products/idempotency.repository.spec.ts`

- [ ] **Step 1: Write the model and its provider**

```ts
// src/products/repository/models/idempotency-key.model.ts
import type { Provider } from '@nestjs/common';
import {
  DataTypes, Model, Sequelize,
  type CreationOptional, type InferAttributes, type InferCreationAttributes,
} from 'sequelize';
import { IDEMPOTENCY_MODEL, SEQUELIZE } from '../../../database/database.tokens';

export class IdempotencyKeyModel extends Model<
  InferAttributes<IdempotencyKeyModel>,
  InferCreationAttributes<IdempotencyKeyModel>
> {
  declare id: CreationOptional<number>;
  declare idempotencyKey: string;
  declare productId: number;
  declare requestHash: string;
  declare responseStatus: number | null;
  declare responseBody: unknown;
  declare createdAt: CreationOptional<Date>;
}

export function initIdempotencyKeyModel(sequelize: Sequelize): typeof IdempotencyKeyModel {
  IdempotencyKeyModel.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      idempotencyKey: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      responseStatus: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      responseBody: { type: DataTypes.JSON, allowNull: true },
      createdAt: DataTypes.DATE(3),
    },
    { sequelize, tableName: 'idempotency_keys', timestamps: false },
  );
  return IdempotencyKeyModel;
}

export const idempotencyModelProvider: Provider = {
  provide: IDEMPOTENCY_MODEL,
  inject: [SEQUELIZE],
  useFactory: (sequelize: Sequelize): typeof IdempotencyKeyModel => initIdempotencyKeyModel(sequelize),
};
```

- [ ] **Step 2: Write the failing test**

```ts
// test/unit/products/idempotency.repository.spec.ts
import { QueryTypes } from 'sequelize';
import { IdempotencyRepository } from '../../../src/products/repository/idempotency.repository';

function sequelizeMock(query: jest.Mock) {
  return { query } as unknown as import('sequelize').Sequelize;
}

describe('IdempotencyRepository', () => {
  it('restricts the lookup to the retention window', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new IdempotencyRepository(sequelizeMock(query));
    await repository.findFresh('key-12345678', 24, {} as never);

    const [sql, options] = query.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toContain('INTERVAL :hours HOUR');
    expect(options.replacements).toMatchObject({ key: 'key-12345678', hours: 24 });
  });

  it('reports false when the product does not exist', async () => {
    // The INSERT ... SELECT inserts nothing when the token matches no product.
    const query = jest.fn().mockResolvedValue([undefined, 0]);
    const repository = new IdempotencyRepository(sequelizeMock(query));
    await expect(
      repository.insertPending('key-12345678', 'SKU-999999', 'hash', {} as never),
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `pnpm test -- idempotency.repository`
Expected: FAIL, cannot find module `idempotency.repository`.

- [ ] **Step 4: Write the repository**

```ts
// src/products/repository/idempotency.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, Sequelize, type Transaction } from 'sequelize';
import { SEQUELIZE } from '../../database/database.tokens';

export interface IdempotencyRecord {
  readonly requestHash: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
}

@Injectable()
export class IdempotencyRepository {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async findFresh(key: string, hours: number, transaction: Transaction): Promise<IdempotencyRecord | null> {
    const rows = await this.sequelize.query<IdempotencyRecord>(
      `SELECT requestHash, responseStatus, responseBody
         FROM idempotency_keys
        WHERE idempotencyKey = :key
          AND createdAt > NOW(3) - INTERVAL :hours HOUR`,
      { replacements: { key, hours }, transaction, type: QueryTypes.SELECT },
    );
    const [first] = rows;
    return first ?? null;
  }

  /**
   * INSERT ... SELECT registers the key and checks that the product exists in
   * one statement, so the product's internal id never leaves this layer.
   * Returns false when no product carries that token.
   */
  async insertPending(
    key: string,
    productToken: string,
    requestHash: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const [, affected] = await this.sequelize.query(
      `INSERT INTO idempotency_keys (idempotencyKey, productId, requestHash, createdAt)
       SELECT :key, id, :requestHash, NOW(3) FROM products WHERE productToken = :productToken`,
      { replacements: { key, requestHash, productToken }, transaction, type: QueryTypes.INSERT },
    );
    return affected > 0;
  }

  async saveResponse(
    key: string,
    status: number,
    body: unknown,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE idempotency_keys
          SET responseStatus = :status, responseBody = :body
        WHERE idempotencyKey = :key`,
      {
        replacements: { key, status, body: JSON.stringify(body) },
        transaction,
        type: QueryTypes.UPDATE,
      },
    );
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- idempotency.repository`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(products): add the idempotency repository"
```

---

### Task 5.2: The header decorator

**Files:**
- Create: `src/products/controller/idempotency-key.decorator.ts`
- Test: `test/unit/products/idempotency-key.decorator.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/products/idempotency-key.decorator.spec.ts
import { readIdempotencyKey } from '../../../src/products/controller/idempotency-key.decorator';
import { ValidationFailedError } from '../../../src/common/errors/validation-failed.error';

describe('readIdempotencyKey', () => {
  it('accepts an opaque URL-safe key', () => {
    expect(readIdempotencyKey('9f8c1a2e-4b7d')).toBe('9f8c1a2e-4b7d');
  });

  it('rejects a missing header', () => {
    expect(() => readIdempotencyKey(undefined)).toThrow(ValidationFailedError);
  });

  it('rejects a repeated header', () => {
    // A list is not a promise about one operation.
    expect(() => readIdempotencyKey(['a-key-value', 'another-key'])).toThrow(ValidationFailedError);
  });

  it('rejects a key that is too short', () => {
    expect(() => readIdempotencyKey('short')).toThrow(ValidationFailedError);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test -- idempotency-key.decorator`
Expected: FAIL, cannot find the module.

- [ ] **Step 3: Write the decorator**

```ts
// src/products/controller/idempotency-key.decorator.ts
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

export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  return readIdempotencyKey(request.headers[HEADER]);
});
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- idempotency-key.decorator`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(products): validate the Idempotency-Key header in one place"
```

---

### Task 5.3: Idempotent stock change

**Files:**
- Modify: `src/products/service/products.service.ts`,
  `src/products/products.errors.ts`,
  `src/products/controller/products.controller.ts`,
  `src/products/products.module.ts`
- Modify: `test/unit/products/products.service.spec.ts`
- Modify: `test/e2e/products.stock.e2e-spec.ts`,
  `test/e2e/products.stock-concurrency.e2e-spec.ts`

- [ ] **Step 1: Add the two errors**

```ts
// in src/products/products.errors.ts
export class IdempotencyKeyReuseError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
  readonly status = 409;
  readonly title = 'Idempotency key reused';

  constructor() {
    super('This Idempotency-Key was already used for a different request.');
  }
}

export class IdempotencyRequestInProgressError extends DomainError {
  readonly code = 'IDEMPOTENCY_REQUEST_IN_PROGRESS';
  readonly status = 409;
  readonly title = 'Request in progress';

  constructor() {
    super('A request with this Idempotency-Key is still being processed. Retry shortly.');
  }
}
```

- [ ] **Step 2: Write the failing service tests**

```ts
// in test/unit/products/products.service.spec.ts
import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
} from '../../../src/products/products.errors';
import type { IdempotencyRepository } from '../../../src/products/repository/idempotency.repository';

function keysMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findFresh: jest.fn().mockResolvedValue(null),
    insertPending: jest.fn().mockResolvedValue(true),
    saveResponse: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IdempotencyRepository;
}

const stored = {
  productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 7,
  createdAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z',
};

describe('ProductsService.changeStock idempotency', () => {
  it('replays the stored response without touching stock', async () => {
    const repository = stockRepositoryMock();
    const keys = keysMock({
      findFresh: jest.fn().mockResolvedValue({ requestHash: expectedHash, responseStatus: 200, responseBody: stored }),
    });
    const service = new ProductsService(repository, runner, keys);

    const result = await service.changeStock('SKU-000123', -3, 'key-12345678');
    expect(result.stock).toBe(7);
    expect(repository.applyStockDelta).not.toHaveBeenCalled();
  });

  it('rejects the same key used with a different payload', async () => {
    const keys = keysMock({
      findFresh: jest.fn().mockResolvedValue({ requestHash: 'a-different-hash', responseStatus: 200, responseBody: stored }),
    });
    const service = new ProductsService(stockRepositoryMock(), runner, keys);
    await expect(service.changeStock('SKU-000123', -3, 'key-12345678'))
      .rejects.toBeInstanceOf(IdempotencyKeyReuseError);
  });

  it('rejects a key whose request is still in flight', async () => {
    const keys = keysMock({
      findFresh: jest.fn().mockResolvedValue({ requestHash: expectedHash, responseStatus: null, responseBody: null }),
    });
    const service = new ProductsService(stockRepositoryMock(), runner, keys);
    await expect(service.changeStock('SKU-000123', -3, 'key-12345678'))
      .rejects.toBeInstanceOf(IdempotencyRequestInProgressError);
  });

  it('raises ProductNotFound when the key cannot be attached to a product', async () => {
    const keys = keysMock({ insertPending: jest.fn().mockResolvedValue(false) });
    const service = new ProductsService(stockRepositoryMock(), runner, keys);
    await expect(service.changeStock('SKU-999999', -3, 'key-12345678'))
      .rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
```

Define `expectedHash` at the top of the file by importing the exported helper:
`import { hashStockRequest } from '../../../src/products/service/products.service';`
and `const expectedHash = hashStockRequest('SKU-000123', -3);`

- [ ] **Step 3: Run and watch them fail**

Run: `pnpm test -- products.service`
Expected: FAIL, `hashStockRequest` is not exported.

- [ ] **Step 4: Rewrite `changeStock`**

```ts
import { createHash } from 'node:crypto';
import { IDEMPOTENCY_RETENTION_HOURS } from '../products.constants';
import { IdempotencyRepository } from '../repository/idempotency.repository';
import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
} from '../products.errors';

/** Canonical by construction: the same operation always hashes the same. */
export function hashStockRequest(productToken: string, delta: number): string {
  return createHash('sha256')
    .update(`PATCH /products/${productToken}/stock {"delta":${String(delta)}}`)
    .digest('hex');
}

function toStored(product: Product): Record<string, unknown> {
  return { ...product, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString() };
}

function fromStored(raw: unknown): Product {
  const stored = raw as Record<string, string | number>;
  return {
    productToken: String(stored.productToken),
    name: String(stored.name),
    price: String(stored.price),
    stock: Number(stored.stock),
    createdAt: new Date(String(stored.createdAt)),
    updatedAt: new Date(String(stored.updatedAt)),
  };
}
```

```ts
  constructor(
    private readonly products: ProductRepository,
    private readonly transactions: TransactionRunner,
    private readonly keys: IdempotencyRepository,
  ) {}

  async changeStock(productToken: string, delta: number, idempotencyKey: string): Promise<Product> {
    const requestHash = hashStockRequest(productToken, delta);

    return this.transactions.run(async (transaction) => {
      await this.products.setLockWaitTimeout(transaction, STOCK_LOCK_WAIT_SECONDS);

      const existing = await this.keys.findFresh(idempotencyKey, IDEMPOTENCY_RETENTION_HOURS, transaction);
      if (existing !== null) {
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyKeyReuseError();
        }
        if (existing.responseStatus === null) {
          throw new IdempotencyRequestInProgressError();
        }
        return fromStored(existing.responseBody);
      }

      // Registering the key and applying the effect share this transaction:
      // on any failure below, both disappear and a retry is executed afresh.
      const attached = await this.keys.insertPending(idempotencyKey, productToken, requestHash, transaction);
      if (!attached) {
        throw new ProductNotFoundError(productToken);
      }

      const affected = await this.products.applyStockDelta(productToken, delta, transaction);
      if (affected === 0) {
        const stock = await this.products.findStockForUpdate(productToken, transaction);
        if (stock === null) {
          throw new ProductNotFoundError(productToken);
        }
        throw delta < 0 ? new InsufficientStockError(stock) : new StockLimitExceededError();
      }

      const product = await this.products.findByToken(productToken, transaction);
      if (product === null) {
        throw new ProductNotFoundError(productToken);
      }

      await this.keys.saveResponse(idempotencyKey, 200, toStored(product), transaction);
      return product;
    });
  }
```

- [ ] **Step 5: Wire the controller and the module**

```ts
  @Patch(':productToken/stock')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ProductResponse })
  async changeStock(
    @Param() params: ProductTokenParam,
    @Body() dto: UpdateStockDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<DataResponse<ProductResponse>> {
    const product = await this.products.changeStock(params.productToken, dto.delta, idempotencyKey);
    return { data: ProductResponse.from(product) };
  }
```

Add `IdempotencyRepository` and `idempotencyModelProvider` to the providers of
`src/products/products.module.ts`.

- [ ] **Step 6: Update the existing stock tests to send the header**

Every request in `products.stock.e2e-spec.ts` and
`products.stock-concurrency.e2e-spec.ts` now needs a unique header. In the
concurrency test the key must differ per request, since twenty identical keys
would be twenty replays of one operation:

```ts
        request(app.getHttpServer())
          .patch('/products/SKU-000123/stock')
          .set('Idempotency-Key', `concurrent-${String(index)}`)
          .send({ delta: -1 }),
```

with `Array.from({ length: 20 }, (_unused, index) => ...)`.

- [ ] **Step 7: Run the tests**

Run: `pnpm test`
Expected: PASS, 11 service tests among them.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(products): make the stock change idempotent per key"
```

---

### Task 5.4: Idempotency end to end

**Files:**
- Test: `test/e2e/products.idempotency.e2e-spec.ts`

- [ ] **Step 1: Write the test**

```ts
// test/e2e/products.idempotency.e2e-spec.ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };
const key = 'idem-key-000001';

describe('idempotent stock changes', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => {
    await resetDatabase(app.get<Sequelize>(SEQUELIZE));
    await request(app.getHttpServer()).post('/products').send(body);
  });
  afterAll(async () => { await app.close(); });

  const patch = (): request.Test =>
    request(app.getHttpServer()).patch('/products/SKU-000123/stock').set('Idempotency-Key', key);

  it('requires the header', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock').send({ delta: -1 });
    expect(response.status).toBe(400);
  });

  it('replays the same response and applies the delta once', async () => {
    const first = await patch().send({ delta: -3 });
    const second = await patch().send({ delta: -3 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect(after.body.data.stock).toBe(7);
  });

  it('rejects the same key with a different payload', async () => {
    await patch().send({ delta: -3 });
    const response = await patch().send({ delta: -4 });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  it('keeps nothing when the request fails, so a retry is executed', async () => {
    const failed = await patch().send({ delta: -99 });
    expect(failed.status).toBe(409);
    expect(failed.body.code).toBe('INSUFFICIENT_STOCK');

    // The rolled-back key must not turn a legitimate retry into a replay.
    const retried = await patch().send({ delta: -99 });
    expect(retried.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('removes the keys of a deleted product', async () => {
    await patch().send({ delta: -1 });
    await request(app.getHttpServer()).delete('/products/SKU-000123');

    const sequelize = app.get<Sequelize>(SEQUELIZE);
    const rows = await sequelize.query('SELECT COUNT(*) AS total FROM idempotency_keys');
    expect(Number((rows[0] as [{ total: number }])[0].total)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `make test`
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(products): cover replay, reuse, rollback and cascade"
```

---

# Slice 6 — Delivery

**Do not skip this slice.** Documentation is scored, and a repository a
reviewer cannot start scores nothing at all.

### Task 6.1: Seed data

**Files:**
- Create: `db/seeds/products.seed.ts`

- [ ] **Step 1: Write the seed**

```ts
// db/seeds/products.seed.ts
import { Sequelize } from 'sequelize';

const catalogue = [
  { productToken: 'SKU-000001', name: 'Blue cotton shirt', price: '19.99', stock: 10 },
  { productToken: 'SKU-000002', name: 'Leather belt', price: '34.50', stock: 3 },
  { productToken: 'SKU-000003', name: 'Wool scarf', price: '24.00', stock: 0 },
  { productToken: 'SKU-000004', name: 'Canvas tote', price: '12.75', stock: 42 },
  { productToken: 'SKU-000005', name: 'Sample sachet', price: '0.00', stock: 100 },
];

async function seed(): Promise<void> {
  const sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'ecommerce',
    username: process.env.DB_USER ?? 'products',
    password: process.env.DB_PASSWORD ?? 'products',
    logging: false,
  });

  for (const product of catalogue) {
    // Idempotent: running the seed twice must not duplicate or overwrite.
    await sequelize.query(
      `INSERT IGNORE INTO products (productToken, name, price, stock, createdAt, updatedAt)
       VALUES (:productToken, :name, :price, :stock, NOW(3), NOW(3))`,
      { replacements: product },
    );
  }

  await sequelize.close();
}

void seed();
```

The catalogue deliberately contains a zero-stock product and a free one: the
two edge cases a reviewer will try first.

- [ ] **Step 2: Verify**

Run: `docker compose run --rm migrate pnpm seed && curl -s localhost:3000/products | head -c 200`
Expected: five products, run twice with no duplicates.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): seed a small demo catalogue"
```

---

### Task 6.2: README and decision records

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/api.md`,
  `docs/decisions/0001-idempotency-key.md`,
  `docs/decisions/0002-atomic-stock-update.md`,
  `docs/decisions/0003-plain-sequelize.md`

- [ ] **Step 1: Write the README**

It must contain, in this order: what the service is in two sentences;
prerequisites (Docker only); `docker compose up` and what appears; `make test`;
the link to `/docs` for Swagger; **the two decisions the brief leaves open**
(delta semantics and `page`/`size` pagination) stated explicitly as choices;
one sample request and response per endpoint, copied from the passing tests;
the `docker compose down -v` caveat; and a short "what I would do next" list
(purge job, pipeline, keyset pagination).

- [ ] **Step 2: Write `docs/architecture.md`**

Layers and their rules, the path of one request from controller to repository
and back, why the ORM cannot escape `repository/`, how transactions are owned
by the service, and how the error translation works. Link to the design
document rather than repeating it.

- [ ] **Step 3: Write `docs/api.md`**

The six endpoints with request and response examples and the full error
catalogue, each with its `code`. This is the document `type` in a problem body
points at.

- [ ] **Step 4: Write the three ADRs**

Each in the same shape: Context, Decision, Consequences, Alternatives
rejected. Take the reasoning from the design document's decision table —
entries 4 and 5 for idempotency, 2 and 3 for the atomic update, 15 for plain
Sequelize.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add the README, architecture, API reference and three ADRs"
```

---

### Task 6.3: Prove it runs from a clean clone

**Files:** none — this task is verification.

- [ ] **Step 1: Clone into a temporary directory**

```bash
cd /tmp && rm -rf products-check && git clone /home/sdiaco/dev/me/iw-products-service products-check && cd products-check
```

- [ ] **Step 2: Start it with nothing else installed**

Run: `docker compose up --build`
Expected: MySQL becomes healthy, migrations report as executed, the seed runs,
the API logs that it is listening.

- [ ] **Step 3: Exercise every endpoint**

```bash
curl -s localhost:3000/health
curl -s localhost:3000/products?page=1&size=2
curl -s -X POST localhost:3000/products -H 'Content-Type: application/json' \
  -d '{"productToken":"SKU-000999","name":"Test","price":"1.50","stock":4}'
curl -s -X PATCH localhost:3000/products/SKU-000999/stock \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-key-0001' -d '{"delta":-1}'
curl -s -X DELETE -i localhost:3000/products/SKU-000999 | head -1
```
Expected: `200`, a page of five, `201`, `200` with stock 3, `204`.

- [ ] **Step 4: Run the tests in the clone**

Run: `make test`
Expected: unit and e2e green.

- [ ] **Step 5: Fix whatever broke, then repeat until step 2 to 4 pass first try**

Anything that needed a manual step is a README bug or a Compose bug. Fix it in
the real repository, push, and re-clone.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: make the stack start from a clean clone without manual steps"
```

---

### Task 6.4: Rehearse a live change

**Files:** none permanent — the work is reverted at the end.

The panel will ask for a change while you watch. Do it once alone first.

- [ ] **Step 1: Add a `sku` field end to end**

A migration adding the column, the model attribute, the plain type, the DTO
with its validation, `ProductResponse`, and one unit test plus one e2e
assertion.

- [ ] **Step 2: Run the whole suite**

Run: `make test`
Expected: green.

- [ ] **Step 3: Time yourself, then revert**

```bash
git reset --hard HEAD
```

If it took more than fifteen minutes, the friction is worth knowing about
before Monday, not during.

- [ ] **Step 4: Write the panel notes**

In `notes/04-panel-qa.md` (local only, not committed): how a stock change would
publish an event to Kafka and what the outbox pattern solves; where a GraphQL
layer would sit and why this service would stay REST behind it; how this would
scale on AWS; why the update is atomic; what you would change with more time.
Add the two or three questions you want to ask them.

---

### Task 6.5: Record the work

**Files:**
- Modify: `LIFECYCLE.md`

- [ ] **Step 1: Close step 3 and add the implementation steps**

One entry per slice, five fields each, in first person, under fifteen lines:
what it set out to settle, what was produced, why it was done that way, where
AI was used and what you overrode, and what it unblocked.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs(lifecycle): record the implementation steps"
```

---

## Plan self-review

**Spec coverage.** Every section of the design maps to a task: the contract to
Slices 1 to 5, the data model to Task 0.6, the stock flow to Tasks 4.2 and 5.3,
the architecture to Tasks 0.5, 1.2 and 4.1, validation and error handling to
Task 0.4, testing to the tests inside each slice, the stack to Task 0.1, the
local environment to Task 0.2, and documentation to Slice 6. The one design
statement with no task is the purge of expired idempotency records, which the
design itself declares out of scope and documents instead.

**Type consistency.** `Product`, `NewProduct`, `Page<T>` and `PageMeta` are
defined once in Task 1.1 and used unchanged afterwards. Repository methods keep
the same names throughout: `create`, `findByToken`, `findPage`,
`deleteByToken`, `setLockWaitTimeout`, `applyStockDelta`, `findStockForUpdate`.
`ProductsService.changeStock` gains a third parameter in Task 5.3, and Task 5.3
Step 6 updates every existing caller — the only signature that changes across
slices, called out where it happens.

**Known soft spots, flagged rather than hidden.**

1. ~~Node's type stripping loading the `.ts` migrations~~ — **resolved, and the
   assumption was wrong.** Node classifies a `.ts` file using `import` syntax as
   ESM when `package.json` declares no `"type"`, and `__dirname` does not exist
   there, which the migration glob needs. The migrations are compiled first:
   `tsc -p tsconfig.json --outDir dist && node dist/db/umzug.js up`, and the
   Umzug glob targets `migrations/*.js`. No new dependency was added.

   **Consequence for Task 0.7:** the end-to-end `globalSetup` imports `migrator`
   through ts-jest, where `__dirname` is `db/` and only `.ts` files exist, so the
   glob would match nothing and every table would be missing. Whoever implements
   that task must verify the migrations actually run from `globalSetup` and not
   assume it.
2. Swagger's UI assets on the Fastify adapter may need `@fastify/static`.
   Task 0.7 Step 8 says what to do if they 404.
3. The concurrency test depends on a pool of at least twenty connections and on
   a lock wait timeout the machine can meet. Task 4.4 Step 5 runs it five times
   for that reason.
