# iw-products-service

A NestJS + Sequelize + MySQL HTTP service that manages products for an e-commerce platform: create, list, get, update stock, and delete, with concurrency-safe stock mutations and idempotent stock updates. Built as a take-home assessment.

## Prerequisites

Docker (and Docker Compose v2). Nothing else.

## Run

```sh
docker compose up
```

Starts MySQL on port 3307, runs migrations, seeds the catalogue, and starts the API on port 3000. Swagger is available at [http://localhost:3000/docs](http://localhost:3000/docs).

> **First-run caveat:** MySQL init scripts (`db/init/`) run only when the data volume is first created. If you have an older volume from a previous run, `docker compose down -v` before `docker compose up` to recreate it.

## Test

```sh
make test
```

Runs inside the container: format check → lint → type-check → unit tests → end-to-end tests against a real MySQL. No local Node required.

## API

Interactive: [http://localhost:3000/docs](http://localhost:3000/docs)  
Reference: [docs/api.md](docs/api.md)

## Design decisions

Two decisions the brief leaves open, chosen deliberately:

- **Stock update uses a delta, not an absolute set.** A delta models the real event (a sale, a return) and makes atomicity and idempotency necessary rather than decorative; an absolute set cannot be made idempotent without knowing the value before the call.
- **Pagination is page/size, not a cursor.** It is the shape a reader understands from the README without explanation, and `COUNT` is negligible at this scale.

## Sample requests

### POST /products — create

```http
POST /products
Content-Type: application/json

{ "productToken": "SKU-000123", "name": "Blue cotton shirt", "price": "19.99", "stock": 10 }
```

```json
201 Created
Location: /products/SKU-000123

{
  "data": {
    "productToken": "SKU-000123",
    "name": "Blue cotton shirt",
    "price": "19.99",
    "stock": 10,
    "createdAt": "2026-08-14T10:00:00.000Z",
    "updatedAt": "2026-08-14T10:00:00.000Z"
  }
}
```

### GET /products — list

```http
GET /products?page=1&size=20
```

```json
200 OK

{
  "data": [
    {
      "productToken": "SKU-000123",
      "name": "Blue cotton shirt",
      "price": "19.99",
      "stock": 10,
      "createdAt": "2026-08-14T10:00:00.000Z",
      "updatedAt": "2026-08-14T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "size": 20, "total": 1, "totalPages": 1 }
}
```

### GET /products/:productToken — get one

```http
GET /products/SKU-000123
```

```json
200 OK

{
  "data": {
    "productToken": "SKU-000123",
    "name": "Blue cotton shirt",
    "price": "19.99",
    "stock": 10,
    "createdAt": "2026-08-14T10:00:00.000Z",
    "updatedAt": "2026-08-14T10:00:00.000Z"
  }
}
```

### PATCH /products/:productToken/stock — update stock

```http
PATCH /products/SKU-000123/stock
Idempotency-Key: 9f8c1a2e-4b3d-11ef-a1c2-0242ac130002
Content-Type: application/json

{ "delta": -3 }
```

```json
200 OK

{
  "data": {
    "productToken": "SKU-000123",
    "name": "Blue cotton shirt",
    "price": "19.99",
    "stock": 7,
    "createdAt": "2026-08-14T10:00:00.000Z",
    "updatedAt": "2026-08-14T10:05:00.000Z"
  }
}
```

### DELETE /products/:productToken — delete

```http
DELETE /products/SKU-000123
```

```
204 No Content
```

### GET /health — health check

```http
GET /health
```

```json
200 OK

{ "status": "ok" }
```

## What I would do next

- **Purge job for expired idempotency records** — retention is enforced on read but rows are never deleted; a scheduled `DELETE … LIMIT 10000` handles that.
- **CI pipeline** — the local `pre-push` gate is not a substitute; 30 lines of GitHub Actions would run the same `make test` on every push.
- **Keyset pagination** — `page/size` drifts on concurrent inserts; cursor-based pagination on `id` would solve it.
- **Event publishing** — stock changes and product lifecycle events belong on a message bus for downstream consumers.
