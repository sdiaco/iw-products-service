# Architecture

For full context — decisions, data model, and contract — see
[docs/design/2026-08-14-products-service-design.md](design/2026-08-14-products-service-design.md).

## Layout

Feature-first. `src/` is a map of domains, not of layers.

```
src/
├── config/           startup validation, fail-fast
├── common/
│   ├── errors/       DomainError base, ProblemDetails, DomainExceptionFilter
│   └── logging/      AppLogger wrapper
├── database/         Sequelize factory, transaction runner, health probe
├── health/           GET /health
└── products/
    ├── controller/   parse, validate, format — no business rules
    ├── service/      business rules, transaction owner
    └── repository/   Sequelize stays here; returns plain domain types
```

Every domain module has exactly these three layers. Cross-cutting code (`common/`, `database/`) sits outside them.

## Request path: PATCH /products/:token/stock

```
Controller
  │  parse token param, read Idempotency-Key header, validate UpdateStockDto
  ▼
ProductsService.changeStock(token, delta, idempotencyKey)
  │  open transaction, set lock timeout to 3 s
  │  look up idempotency record → replay or guard
  │  conditional UPDATE (one statement, guard in WHERE clause)
  │  on zero rows: locking SELECT to read current stock → typed 409
  │  on success: store response on idempotency record, commit
  │  on any domain error: rollback (idempotency record disappears)
  ▼
ProductRepository / IdempotencyRepository
  │  Sequelize queries, driver error translation
  │  return plain readonly Product, never a Sequelize model
  ▼
Controller
  └  wrap in { data: ProductResponse } — no `id` field
```

The transaction is opened in the service and passed explicitly to each repository method. No CLS, no interceptor: the method signature states what participates.

## ORM boundary

`sequelize` may only be imported under `repository/` and `database/`. This is an ESLint `no-restricted-imports` rule in `eslint.config.mjs`, not a convention. The repository returns a plain `readonly` type (`Product`), so the service never holds a `.save()` or `.destroy()` handle. Replacing Sequelize means rewriting one class body; the service does not recompile.

## Error translation

One filter handles everything: `DomainExceptionFilter` is registered globally via `useGlobalFilters`, so it also catches framework errors (malformed JSON, unknown route, wrong method) that would otherwise produce a different body shape.

Translation logic:

| What was caught | Action |
|---|---|
| `DomainError` subclass | Use its `status` and `code`; call `extra()` for optional fields |
| `HttpException` (NestJS/Fastify) | Keep its status; assign `code: 'HTTP_ERROR'` |
| Anything else | Log with stack; return `500 INTERNAL_ERROR` |

All responses use `Content-Type: application/problem+json` and the RFC 9457 shape:

```json
{
  "type": "/errors/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Stock cannot go below zero.",
  "instance": "/products/SKU-000123/stock",
  "code": "INSUFFICIENT_STOCK",
  "available": 2
}
```

Driver errors are translated in the repository, the only layer that knows the driver: `ER_DUP_ENTRY` → `ProductTokenAlreadyExistsError`; `ER_LOCK_WAIT_TIMEOUT` / `ER_LOCK_DEADLOCK` → `ConcurrentModificationError`; connection failure → `DatabaseUnavailableError`.

## Validation

A global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform` enabled. Unknown fields are rejected. DTOs carry `class-validator` and `@nestjs/swagger` decorators side by side so the contract and its documentation cannot drift.
