# Products Service — Design

Date: 2026-08-14 · Status: approved · Supersedes: nothing

This document is the authority for what the service does and why. Engineering
conventions live in [AGENTS.md](../../AGENTS.md); how the build was carried out
lives in [LIFECYCLE.md](../../LIFECYCLE.md).

---

## 1. Context and scope

A back-end service for an e-commerce platform, built as a take-home assessment.
One `products` module, five CRUD endpoints plus a health check, one table (plus
a support table for idempotency). NestJS, Sequelize and MySQL are mandated by
the brief.

The brief leaves two decisions open on purpose — stock update semantics and
pagination style — and expects both to be chosen deliberately and documented.
Section 3 records them.

A panel reads, questions and edits this code live for an hour. The tiebreaker
for every decision below: **every line must be explainable in one sentence.**

### In scope

- Create, list (paginated), read, update stock, delete a product.
- Request validation, typed domain errors, correct HTTP status codes.
- Concurrency-safe stock mutation and idempotent stock requests.
- Unit tests (service and repository, collaborators mocked) and end-to-end
  tests against a real MySQL with real migrations.
- Docker Compose that brings the whole thing up from a clean checkout.

### Out of scope

Deliberately excluded; adding any of these requires an ADR.

AuthN/AuthZ · rate limiting, CORS, security headers · message brokers and event
streaming · caching · request correlation and per-request logging · a stock
movement ledger · sort and filter parameters on the list endpoint · updating
`name` or `price` · soft delete · multi-currency.

---

## 2. Decisions

| # | Decision | Reason in one sentence |
|---|---|---|
| 1 | Stock update takes a **delta**, not an absolute value | It models the real event (a sale, a return) and makes atomicity and idempotency necessary rather than decorative. |
| 2 | Stock is mutated by **one conditional `UPDATE`** | The guard lives in the `WHERE` clause, so two concurrent requests cannot both succeed on the last unit. |
| 3 | A delta that would take stock below zero is **rejected** (409), never clamped | Silently losing units is a data-integrity bug in a domain that handles money. |
| 4 | `PATCH /stock` requires an **`Idempotency-Key`** header | A retried delta would otherwise be applied twice; the header is the only way the client can say "this is the same operation". |
| 5 | On failure the idempotency record is **rolled back** | Idempotency protects effects, and a failed request produced none — a stored 409 would replay forever after restocking. |
| 6 | The public identifier is **`productToken`**, never `id` | The token is the business identity; exposing an auto-increment id leaks row counts and invites enumeration. |
| 7 | `productToken` is **supplied by the client** | The brief puts it in the create body, and it is an external identity (like a SKU) owned upstream, not by this service. |
| 8 | `productToken` is a token, **not a slug** | Identity and presentation are different concepts: a slug derived from the name breaks every URL and every issued idempotency key on the first rename. |
| 9 | Pagination is **`page` + `size` with a total** | It is the shape a reader understands from the README without explanation, and `COUNT` is free at this scale. |
| 10 | `price` is `DECIMAL(10,2)` in the database and a **string** in JSON | The column must be exact for money; a JSON number is an IEEE-754 double and cannot represent 19.99 exactly. |
| 11 | `stock` is a **signed** `INT` with a `CHECK (stock >= 0)` | With `UNSIGNED`, `WHERE stock + :delta >= 0` does unsigned arithmetic and raises `ER_DATA_OUT_OF_RANGE` instead of simply not matching. |
| 12 | Errors are **RFC 9457** `application/problem+json` | It is a citable standard produced at a single translation point, with a stable `code` the client can branch on. |
| 13 | Delete is a **hard delete** | Soft delete would need a filter on every query and would collide with the unique constraint on recreated tokens — real cost, no benefit in scope. |
| 14 | The repository returns a **plain readonly type**, not a Sequelize model | Returning the model would hand the service `.save()` and `.destroy()`, letting it bypass its own repository. |
| 15 | Plain `sequelize`, **no `@nestjs/sequelize`** | The brief asks for the `sequelize` package, and hand-written providers show dependency injection rather than hiding it. |

---

## 3. API contract

Base path: `/` · Content type: `application/json` · Errors:
`application/problem+json`.

### 3.1 Create a product

```
POST /products
Content-Type: application/json

{ "productToken": "SKU-000123", "name": "Blue cotton shirt", "price": "19.99", "stock": 10 }
```

```
201 Created
Location: /products/SKU-000123

{ "data": { "productToken": "SKU-000123", "name": "Blue cotton shirt",
            "price": "19.99", "stock": 10,
            "createdAt": "2026-08-14T10:00:00.000Z",
            "updatedAt": "2026-08-14T10:00:00.000Z" } }
```

`price` is accepted as a string or a number and always returned as a string.
More than two decimal places is rejected rather than rounded.

Errors: `400 VALIDATION_FAILED` · `409 PRODUCT_TOKEN_ALREADY_EXISTS`.

### 3.2 List products

```
GET /products?page=1&size=20
```

```
200 OK

{ "data": [ /* products */ ],
  "meta": { "page": 1, "size": 20, "total": 137, "totalPages": 7 } }
```

`page` is 1-based (default 1), `size` defaults to 20 and is capped at 100. A
page past the last one returns `200` with an empty `data` array — an empty
result is not an error.

Offset pagination drifts: a product created between two requests shifts the
items and one can be seen twice or missed. That is inherent to offsets, not a
defect to fix here — a keyset cursor would solve it and is out of scope.

Errors: `400 VALIDATION_FAILED`.

### 3.3 Get one product

```
GET /products/SKU-000123
```

```
200 OK
{ "data": { /* product */ } }
```

Errors: `400 VALIDATION_FAILED` (token does not match the format) ·
`404 PRODUCT_NOT_FOUND`.

### 3.4 Update stock

```
PATCH /products/SKU-000123/stock
Idempotency-Key: 9f8c1a2e-... (opaque, URL-safe, 8-255 chars)
Content-Type: application/json

{ "delta": -3 }
```

```
200 OK
{ "data": { /* product with the new stock */ } }
```

`delta` is a non-zero integer within the signed `INT` range. Zero is rejected:
it would produce zero affected rows and be indistinguishable from a failure.

Errors:

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `delta` invalid, token malformed, header missing or malformed |
| 404 | `PRODUCT_NOT_FOUND` | No product with that token |
| 409 | `INSUFFICIENT_STOCK` | The delta would take stock below zero |
| 409 | `STOCK_LIMIT_EXCEEDED` | The delta would take stock past the `INT` maximum |
| 409 | `IDEMPOTENCY_KEY_REUSE` | The same key was used with a different payload |
| 409 | `IDEMPOTENCY_REQUEST_IN_PROGRESS` | The same key is currently being processed |
| 409 | `CONCURRENT_MODIFICATION` | A lock wait timed out or a deadlock was resolved against this transaction |

`delta` must be a JSON number. `"delta": "5"` is rejected: accepting a numeric
string would mean guessing, and the client is the one who knows what it meant.

`CONCURRENT_MODIFICATION` carries `Retry-After: 1`. The transaction was rolled
back and the idempotency record with it, so retrying is safe — the same key can
be sent again.

### 3.5 Delete a product

```
DELETE /products/SKU-000123
```

```
204 No Content
```

Deleting a product also removes its idempotency keys (`ON DELETE CASCADE`).

Errors: `400 VALIDATION_FAILED` · `404 PRODUCT_NOT_FOUND`.

### 3.6 Health

```
GET /health
```

`200 OK` with `{ "status": "ok" }` after a successful `SELECT 1`, otherwise
`503` with `code` `DATABASE_UNAVAILABLE`. Compose and CI wait on this endpoint.

### 3.7 Error body

```
409 Conflict
Content-Type: application/problem+json

{ "type": "/errors/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Stock cannot go below zero.",
  "instance": "/products/SKU-000123/stock",
  "code": "INSUFFICIENT_STOCK",
  "available": 2 }
```

Validation failures carry an `errors` array of `{ field, message }`.

`type` is a relative URI resolved against the service, pointing at the section
of `docs/api.md` that describes the failure. RFC 9457 permits relative
references, and inventing a public `https://` namespace the project does not
own would be worse than useless.

`available` is **advisory and point-in-time**: it is read inside the same
transaction as the failed update, so it explains the failure, but a concurrent
request may change it before the client reads it. The only safe client action
remains retrying the delta and handling `409` again.

Responses never expose stack traces, SQL, or schema details. Unmapped errors
surface as a generic `500`.

**Every** error leaves in this shape, including the ones the service does not
raise itself. Malformed JSON, an unknown route, a wrong method and a missing
`Content-Type` are produced by Fastify and Nest, so a filter registered for
domain errors alone would never see them and the API would answer in two
different error formats. The filter is therefore registered for everything and
branches on what it caught: a `DomainError` carries its own status and code, an
`HttpException` keeps its status and is given a code, anything else becomes a
`500`.

Two failures come from the driver rather than from a rule, and are translated
in the repository like any other: a lock wait timeout or a deadlock
(`ER_LOCK_WAIT_TIMEOUT`, `ER_LOCK_DEADLOCK`) becomes
`409 CONCURRENT_MODIFICATION`, and a connection failure becomes
`503 DATABASE_UNAVAILABLE`. Both are the client's cue to retry, and saying so
is more useful than a generic `500`.

### 3.8 DTOs

Four input DTOs, one response type, one paginated wrapper. Every field carries
its validation and its OpenAPI description side by side, so the contract and
its documentation cannot drift.

```ts
// controller/dto/create-product.dto.ts
export class CreateProductDto {
  @ApiProperty({ example: 'SKU-000123' })
  @Matches(PRODUCT_TOKEN_PATTERN)          // ^[A-Za-z0-9_-]{8,64}$
  readonly productToken!: string;

  @ApiProperty({ example: 'Blue cotton shirt' })
  @Transform(trim)                         // before the length check
  @IsString()
  @Length(1, 255)
  readonly name!: string;

  @ApiProperty({ example: '19.99', type: String })
  @Transform(toDecimalString)              // accepts number or string
  @Matches(PRICE_PATTERN)                  // ^\d{1,8}(\.\d{1,2})?$
  readonly price!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  readonly stock!: number;
}

// controller/dto/list-products.query.ts
export class ListProductsQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  readonly size: number = DEFAULT_PAGE_SIZE;
}

// controller/dto/product-token.param.ts
export class ProductTokenParam {
  @Matches(PRODUCT_TOKEN_PATTERN)
  readonly productToken!: string;
}

// controller/dto/update-stock.dto.ts
export class UpdateStockDto {
  @ApiProperty({ example: -3, description: 'Non-zero signed change in stock' })
  @IsInt() @NotEquals(0) @Min(-INT_MAX) @Max(INT_MAX)
  readonly delta!: number;
}
```

The `price` pattern encodes the column: `DECIMAL(10,2)` allows eight integer
digits and two decimals, so a third decimal is a `400` rather than a silent
rounding of someone's money.

`name` is trimmed before it is measured, so a value of only whitespace fails
`@Length(1, 255)` instead of creating a product whose name is three spaces.

The `Idempotency-Key` header is read by a custom `@IdempotencyKey()` parameter
decorator that validates it against `^[A-Za-z0-9_.:-]{8,255}$` and raises the
same `400` as any other invalid input. It is a parameter decorator rather than
a header DTO so the rule lives in one testable place. It also rejects a
repeated header: sending `Idempotency-Key` twice yields a list rather than a
string, and a list is not a promise about one operation.

Outbound:

```ts
// controller/product.response.ts
export class ProductResponse {
  @ApiProperty() readonly productToken: string;
  @ApiProperty() readonly name: string;
  @ApiProperty({ type: String, example: '19.99' }) readonly price: string;
  @ApiProperty() readonly stock: number;
  @ApiProperty() readonly createdAt: string;   // ISO-8601 UTC
  @ApiProperty() readonly updatedAt: string;

  static from(product: Product): ProductResponse { /* explicit mapping */ }
}
```

`ProductResponse` lists its fields explicitly, so a column added to the table
tomorrow cannot leak into the API by accident — and `id` is simply not in the
list. The paginated wrapper is `{ data: ProductResponse[], meta: PageMeta }`
with `meta` carrying `page`, `size`, `total` and `totalPages`.

Note on `!` in DTO fields: this is the definite-assignment assertion, which
tells the compiler the validator populates the field. It is not the non-null
assertion operator (`value!.field`), which stays banned.

---

## 4. Data model

```sql
CREATE TABLE products (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  productToken VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
  name         VARCHAR(255) NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  stock        INT NOT NULL,
  createdAt    DATETIME(3) NOT NULL,
  updatedAt    DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_productToken (productToken),
  CONSTRAINT ck_products_price CHECK (price >= 0),
  CONSTRAINT ck_products_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE idempotency_keys (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotencyKey VARCHAR(255) COLLATE utf8mb4_0900_as_cs NOT NULL,
  productId      BIGINT UNSIGNED NOT NULL,
  requestHash    CHAR(64) NOT NULL,
  responseStatus SMALLINT UNSIGNED NULL,
  responseBody   JSON NULL,
  createdAt      DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_key (idempotencyKey),
  CONSTRAINT fk_idempotency_product FOREIGN KEY (productId)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes:

- `productToken` carries an explicit **case-sensitive** collation. MySQL 8.4
  defaults to `utf8mb4_0900_ai_ci`, under which `SKU-1` and `sku-1` would
  collide on the unique index without anyone having decided that.
- `price >= 0` rather than `> 0`: free products (samples, gifts) are real.
- The foreign key targets `id`, not `productToken`, because `id` is stable and
  never leaves the service.
- `responseStatus IS NULL` means the request is in flight.
- Sequelize is configured with `timezone: '+00:00'`; timestamps are serialised
  as ISO-8601 UTC, so container time zones cannot change the API's output.
- Schema is created by Umzug migrations. `sequelize.sync()` is never used, in
  application code or in tests.

**Retention of `idempotency_keys` is 24 hours, and the rule is enforced when
reading.** A record older than the window is treated as absent, so the request
is executed rather than replayed. A legitimate retry arrives within seconds —
it is a failed HTTP call, not a human decision — so the window is three orders
of magnitude wider than it needs to be.

Deleting the expired rows is a separate concern and is **not implemented**. At
roughly 0.5 KB per row, a hundred thousand stock updates a day is about 50 MB a
day, which has to be reclaimed eventually. The statement is one line and
belongs on a schedule, not inside an HTTP service:

```sql
DELETE FROM idempotency_keys
 WHERE createdAt < NOW(3) - INTERVAL 24 HOUR
 LIMIT 10000;
```

It is documented in `docs/operations.md` so its absence is a decision rather
than an oversight.

---

## 5. The stock update flow

This is the only non-trivial path in the service, and the one the panel is
most likely to read closely.

1. Validate the token format, the `Idempotency-Key` header and `delta`. Any
   failure is `400` before anything touches the database.
2. Compute `requestHash = sha256(method + path + body)`, where the body is
   serialised from the validated DTO with its keys in a fixed order, so two
   requests differing only in JSON key order hash the same.
3. Look up the product by token to obtain its `id`. Absent → `404`.
4. Open a transaction. Everything below runs inside it.
5. Read the idempotency record for the key, restricted to the retention window
   (`createdAt > NOW(3) - INTERVAL 24 HOUR`); an older record is treated as
   absent.
   - Record with a stored response, matching hash → **replay** it verbatim.
   - Record with a stored response, different hash → `409 IDEMPOTENCY_KEY_REUSE`.
   - Record without a stored response → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`.
   - No record → insert one with `responseStatus` `NULL` and continue. A
     concurrent insert of the same key blocks on the unique index and is
     treated as in-progress.
   - Insert failing on the foreign key means the product was deleted after
     step 3 → `404 PRODUCT_NOT_FOUND`.
6. Apply the conditional update, in one statement:

   ```sql
   UPDATE products
      SET stock = stock + :delta, updatedAt = :now
    WHERE productToken = :token
      AND stock + :delta >= 0
      AND stock + :delta <= 2147483647
   ```

7. If zero rows were affected, read the current stock with
   `SELECT ... FOR UPDATE` and translate: row gone → `404`; delta negative →
   `409 INSUFFICIENT_STOCK` with `available`; delta positive →
   `409 STOCK_LIMIT_EXCEEDED`. The read must be a **locking** read: inside
   `REPEATABLE READ`, a plain `SELECT` reads a snapshot and could report a
   value from before the concurrent commit.
8. On success, read the updated row (MySQL has no `UPDATE ... RETURNING`),
   store status and body on the idempotency record, and commit.
9. On any domain error, roll back. The idempotency record disappears with the
   transaction, so a later retry is executed rather than replaying a failure.

Only this endpoint opens a transaction. Create, read and delete are single
statements, and a single statement is already atomic in InnoDB.

---

## 6. Architecture

The tree is organised **feature-first**: the root of `src/` is a map of the
domains, and every domain module has the same three layers inside it. The
alternative — `controllers/`, `services/`, `repositories/` at the root — was
considered and rejected: a single change would spread across three trees, the
NestJS module file would sit apart from the three things it wires, and an
import from one domain into another's internals would become invisible. The
standardisation people actually want from a layer-first tree is preserved by
mandating the internal layout instead: **every domain module has exactly
`controller/`, `service/` and `repository/`**, in this service and the next.

```
.
├── AGENTS.md                    engineering rules (conventions only)
├── ASSESSMENT.md                how LIFECYCLE.md is kept
├── CLAUDE.md                    entry point, imports the two above
├── LIFECYCLE.md                 how the project was built, step by step
├── README.md                    prerequisites, run, test, one example per endpoint
├── .env.example                 every variable, no values
├── docker-compose.yml           mysql + migrate (one-shot) + api
├── Dockerfile                   node:24-alpine, pnpm, multi-stage
├── eslint.config.mjs            flat config, typescript-eslint, import-x boundaries
├── jest.config.ts               unit, parallel, roots: test/unit
├── jest.e2e.config.ts           e2e, --runInBand, globalSetup
├── tsconfig.json                strict, CommonJS
├── .github/workflows/ci.yml     lint, typecheck, unit, e2e
│
├── db/
│   ├── umzug.ts                 migration runner (node runs the .ts directly)
│   ├── migrations/
│   │   ├── 20260814T1000-create-products.ts
│   │   └── 20260814T1010-create-idempotency-keys.ts
│   └── seeds/
│       └── products.seed.ts
│
├── docs/                        versioned, for a reviewer
│   ├── README.md                index
│   ├── architecture.md          layers, modules, the path of one request
│   ├── api.md                   endpoints, examples, error catalogue
│   ├── data-model.md            schema, constraints, migrations
│   ├── testing.md               what unit and e2e prove, how to run them
│   ├── operations.md            Compose, env, migrations, seeds
│   ├── design/                  this document
│   └── decisions/               0001-idempotency-key.md, 0002-atomic-stock-update.md,
│                                0003-plain-sequelize.md, 0004-price-as-string.md,
│                                0005-token-not-slug.md, 0006-typescript-version.md
│
├── notes/                       local only, excluded from git — study notes
│
├── src/
│   ├── main.ts                  bootstrap, Fastify adapter, global pipe and filter
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── env.schema.ts        validated at startup, fails fast
│   │   └── config.module.ts
│   │
│   ├── common/
│   │   ├── errors/                      one concept: how we fail, and how we say it
│   │   │   ├── domain-error.ts          the base every failure extends
│   │   │   ├── problem-details.ts       the RFC 9457 body shape
│   │   │   └── domain-exception.filter.ts
│   │   └── logging/
│   │       └── app-logger.ts            wraps the Nest logger, one place to change
│   │
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.providers.ts        hand-wired Sequelize factory
│   │   └── database.tokens.ts           injection tokens
│   │
│   ├── health/
│   │   ├── health.module.ts
│   │   └── health.controller.ts
│   │
│   └── products/
│       ├── products.module.ts
│       ├── product.ts                   plain readonly type, shared by two layers
│       ├── products.errors.ts           typed failures of this module
│       ├── products.constants.ts        patterns, page defaults, INT_MAX
│       │
│       ├── controller/
│       │   ├── products.controller.ts
│       │   ├── product.response.ts      explicit outward shape, no id
│       │   ├── idempotency-key.decorator.ts
│       │   └── dto/
│       │       ├── create-product.dto.ts
│       │       ├── list-products.query.ts
│       │       ├── product-token.param.ts
│       │       └── update-stock.dto.ts
│       │
│       ├── service/
│       │   └── products.service.ts      rules, orchestration, transaction owner
│       │
│       └── repository/
│           ├── product.repository.ts        domain-shaped, Sequelize stays inside
│           ├── idempotency.repository.ts
│           └── models/
│               ├── product.model.ts
│               └── idempotency-key.model.ts
│
└── test/
    ├── unit/                     mirrors src/
    │   ├── common/errors/domain-exception.filter.spec.ts
    │   ├── config/env.schema.spec.ts
    │   └── products/
    │       ├── products.controller.spec.ts
    │       ├── idempotency-key.decorator.spec.ts
    │       ├── products.service.spec.ts
    │       ├── product.repository.spec.ts
    │       └── idempotency.repository.spec.ts
    └── e2e/
        ├── setup/
        │   ├── global-setup.ts   waits for MySQL, runs migrations
        │   ├── app.factory.ts    boots Nest and awaits the Fastify instance
        │   └── truncate.ts       idempotency_keys before products (foreign key)
        ├── products.create.e2e-spec.ts
        ├── products.list.e2e-spec.ts
        ├── products.get.e2e-spec.ts
        ├── products.delete.e2e-spec.ts
        ├── products.stock.e2e-spec.ts
        ├── products.stock-concurrency.e2e-spec.ts
        └── health.e2e-spec.ts
```

Four placement decisions worth stating:

- **The repository is a concrete class, injected directly.** An abstract port
  with a single implementation that will never have a second is cost without
  benefit. What preserves the dependency inversion is not the extra file but
  the *shape of the methods*: the repository speaks domain
  (`findByToken`, `applyStockDelta`) and never ORM (`update(where, values)`),
  so replacing Sequelize rewrites one class body and the service does not
  recompile. Two lint rules make that a constraint rather than a promise — see
  the rules below.
- **Types live with the layer that owns them.** `ProductResponse` in
  `controller/` because it is the transport shape, `ProblemDetails` in
  `common/errors/` because it is the error shape, and `product.ts` at the
  module root because it is shared by the service and the repository and
  belongs to neither. There is no `types/` directory: grouping by language
  construct separates a type from the code that produces it.
- **`common/errors/` holds the base error, the problem body and the filter.**
  They are one concept — how we fail and how we report it — and the previous
  split into `errors/` and `http/` was a directory created by mechanism rather
  than by meaning.
- **Tests live under `test/`, mirroring `src/`.** `src/` stays production code
  only, and the unit and end-to-end boundary is visible from the root. The cost
  is keeping two trees aligned by hand, accepted deliberately.

Rules, all enforced by ESLint:

- The controller parses, validates and formats; it never imports `repository/`
  and holds no business rules.
- The service holds the rules and owns transactions; it knows nothing about
  HTTP — no request objects, no status codes.
- A repository's public signatures are expressed in domain terms. No ORM type
  (`Model`, `WhereOptions`, `FindOptions`) appears in a parameter or a return
  value; the transaction handle is the single, deliberate exception.
- `sequelize` may only be imported under `repository/` and `database/`
  (`no-restricted-imports`). The ORM cannot leak upward even by accident.
- Sequelize models never leave the repository. The repository returns a plain
  readonly type; the controller maps that to `ProductResponse`, which never
  contains `id`.
- Transactions are created in the service with `sequelize.transaction()` and
  passed explicitly to repository methods. No CLS, no transactional
  interceptor: the signature should state what participates.
- Idempotency lives in the products service, in the same transaction as the
  update. Moving it to an interceptor would put it outside that transaction
  and open the exact window it exists to close.
- The application shuts down on purpose: `enableShutdownHooks()` on the Nest
  app, `SIGTERM` closing the HTTP server before the Sequelize pool, so a
  container stop drains in-flight requests instead of severing them.

---

## 7. Validation and error handling

- A global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and
  `transform` enabled. Unknown fields are rejected, not ignored.
- DTOs carry both `class-validator` and `@nestjs/swagger` decorators, so the
  contract and its documentation cannot drift apart.
- Every failure is a typed class extending `DomainError`. No bare `Error`, no
  strings, no untyped objects.
- `DomainExceptionFilter` is the only place a domain error becomes an HTTP
  status. Unmapped errors become a generic `500` and are logged.
- Driver errors are translated in the repository: `ER_DUP_ENTRY` on
  `products.productToken` becomes `ProductTokenAlreadyExists`, a foreign key
  violation on `idempotency_keys` becomes `ProductNotFound`. The layer that
  knows the driver is the layer that translates it.

---

## 8. Testing

Specs live under `test/`, with `test/unit/` mirroring `src/` and `test/e2e/`
holding the end-to-end suite and its setup.

### Unit

Two levels, each isolated from its own I/O collaborator:

- **Service**, repository mocked — delta below zero produces
  `InsufficientStock` with `available`; zero affected rows with the product
  gone produces `ProductNotFound`; a key with a stored response replays and
  never touches stock; a key without one produces `RequestInProgress`; a
  different hash produces `KeyReuse`; a failed update rolls the record back;
  `totalPages` is a ceiling division.
- **Repository**, Sequelize model mocked — `ER_DUP_ENTRY` becomes the domain
  error; the mapper drops `id`; the offset is derived from page and size; the
  conditional `WHERE` carries both bounds.
- **Filter** — a domain error becomes a `problem+json` body with the right
  status; a framework `HttpException` keeps its status and gains a code; an
  unknown error becomes a `500` with no internals; a validation failure carries
  `errors[]`.

### End-to-end

Real MySQL, real migrations, `supertest` against the Fastify adapter. The
adapter needs `await app.getHttpAdapter().getInstance().ready()` before the
first request, or routes are not yet registered.

Cases: the five endpoints on the happy path; duplicate token; invalid payloads
(three decimal places, short token, unknown field); a page past the last one;
`PATCH` without the header; **a retried key replaying the same response with
the delta applied once**; the same key with a different payload; insufficient
stock leaving the row untouched; **twenty parallel `delta: -1` requests against
stock 10 returning exactly ten `200`s and ten `409`s, ending at zero**; delete
then get; cascade removing the product's keys; health.

Three cases exist to prove the contract has no second shape: **malformed JSON**,
**an unknown route** and **a name made only of whitespace** must all answer in
`problem+json`, the first two coming from the framework rather than from our
code and the third from the trim happening before the length check.

The concurrency test is the one that proves the design, and only a real
database can prove it.

### Environment

- A dedicated `ecommerce_test` database, so tests can never truncate
  development data or seeds.
- `TRUNCATE` in `beforeEach`, `idempotency_keys` before `products` because the
  foreign key forbids the other order. No `sync()`, no transaction-wrapped
  tests: the code under test opens its own transactions and wrapping them
  would falsify the locking behaviour the concurrency test depends on.
- The e2e Jest config runs `--runInBand`. Files share one database, so
  parallel workers would truncate each other's data. Unit tests stay parallel.
- The test connection pool allows at least twenty connections. With the default
  of five, the concurrency test would serialise into four waves and pass
  without ever exercising the race.
- `globalSetup` retries the connection before running migrations, because
  MySQL accepts TCP before it accepts queries.
- Coverage is reported, not gated. An arbitrary threshold is harder to defend
  than the edge cases themselves.

---

## 9. Stack

Versions verified against the npm registry on 2026-08-14, not from memory.

| Component | Version | Note |
|---|---|---|
| Node.js | 24 LTS | 26 is Current until October 2026; a reviewer should run an LTS. Native type stripping runs `db/umzug.ts` with no `ts-node`. |
| TypeScript | 5.9.3 | `typescript-eslint` 8.67 declares `typescript >=4.8.4 <6.1.0` and `ts-jest` 29.4 `>=4.3 <7`, so TypeScript 7 is outside both. |
| NestJS | 11.1.29 | With `@nestjs/platform-fastify`. |
| Sequelize | 6.37.8 | 7 is still alpha. Version 6 is why the build stays CommonJS. |
| mysql2 | 3.23.3 | Returns `DECIMAL` as a string, which is what we want. |
| MySQL | 8.4 | Enforces `CHECK` constraints (8.0.16+). |
| Jest / ts-jest | 30.4.2 / 29.4.12 | |
| Umzug | 3.8.3 | The library underneath `sequelize-cli`, used directly. |
| class-validator | 0.15.1 | |
| `@nestjs/swagger` | 11.4.6 | Serves `/docs`. May need `@fastify/static` for its assets — to confirm on first run. |
| ESLint / Prettier | 10.8.1 / 3.9.6 | Flat config, `import-x` for boundaries. |
| pnpm | 10 | |

Everything runs through Docker Compose: `mysql`, a one-shot `migrate` service
gated on the database healthcheck, and `api` gated on migrations completing.
CI is one GitHub Actions job: lint, typecheck, unit, e2e.

---

## 10. Documentation

`docs/` is versioned and written for a reviewer, another engineer, or an agent:
`architecture.md`, `api.md`, `data-model.md`, `testing.md`, `operations.md`,
`design/` (this document) and `decisions/` (numbered ADRs for idempotency, the
atomic update, plain Sequelize, price as a string, token versus slug, and the
TypeScript pin).

The README stays short and links into `docs/`, and carries the setup, the test
commands and one sample request and response per endpoint, as the brief asks.

---

## 11. Known risks

- `@nestjs/swagger` with the Fastify adapter may require `@fastify/static` to
  serve its UI assets. If so, that is one more dependency to justify.
- Idempotency keys are never purged. Acceptable at this scale, recorded as a
  decision.
- `available` in a `409` is advisory. Documented at the contract level so no
  client treats it as a reservation.
- Expired idempotency records are never deleted. The retention rule is enforced
  when reading, so behaviour is correct, but the table grows until someone runs
  the statement in `docs/operations.md` on a schedule.
- Changing SQL engine is confined to `repository/` and `db/migrations/`. The
  constraints this design relies on — the atomic conditional update,
  `ON DELETE CASCADE`, `CHECK`, `SELECT ... FOR UPDATE`, multi-statement
  transactions — exist across engines. What would change is the driver error
  translation (`ER_DUP_ENTRY` has a different code elsewhere) and engine
  specifics in the DDL: the explicit case-sensitive collation, `DATETIME(3)`,
  the `JSON` column type. The service is untouched, which is what the boundary
  is for.
