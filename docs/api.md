# API Reference

Base path: `/`  
Content type: `application/json`  
Error content type: `application/problem+json` (RFC 9457)

Interactive: Swagger at `/docs` when the service is running.

---

## Endpoints

### POST /products

Create a product.

**Request**

```http
POST /products
Content-Type: application/json

{
  "productToken": "SKU-000123",
  "name": "Blue cotton shirt",
  "price": "19.99",
  "stock": 10
}
```

- `productToken` — `^[A-Za-z0-9_-]{8,64}$`, supplied by the client (external identity, e.g. a SKU)
- `price` — string or number; more than two decimal places is rejected; returned as a string
- `stock` — non-negative integer

**Response**

```http
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

**Errors:** `400 VALIDATION_FAILED` · `409 PRODUCT_TOKEN_ALREADY_EXISTS`

---

### GET /products

List products, paginated.

**Request**

```http
GET /products?page=1&size=20
```

- `page` — 1-based, default 1
- `size` — default 20, max 100

**Response**

```http
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
  "meta": { "page": 1, "size": 20, "total": 137, "totalPages": 7 }
}
```

A page past the last one returns `200` with an empty `data` array.

**Errors:** `400 VALIDATION_FAILED`

---

### GET /products/:productToken

Get one product.

**Request**

```http
GET /products/SKU-000123
```

**Response**

```http
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

**Errors:** `400 VALIDATION_FAILED` · `404 PRODUCT_NOT_FOUND`

---

### PATCH /products/:productToken/stock

Apply a signed stock delta. Requires an idempotency key.

**Request**

```http
PATCH /products/SKU-000123/stock
Idempotency-Key: 9f8c1a2e-4b3d-11ef-a1c2-0242ac130002
Content-Type: application/json

{ "delta": -3 }
```

- `Idempotency-Key` — required; `^[A-Za-z0-9_.:-]{8,255}$`; sending the same key with the same payload replays the stored response without re-applying the delta
- `delta` — non-zero signed integer; `"delta": "5"` (string) is rejected

**Response**

```http
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

**Errors:** `400 VALIDATION_FAILED` · `404 PRODUCT_NOT_FOUND` · `409 INSUFFICIENT_STOCK` · `409 STOCK_LIMIT_EXCEEDED` · `409 IDEMPOTENCY_KEY_REUSE` · `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` · `409 CONCURRENT_MODIFICATION`

`CONCURRENT_MODIFICATION` carries `Retry-After: 1`. The transaction was rolled back — the same idempotency key can be sent again immediately.

---

### DELETE /products/:productToken

Delete a product and its idempotency keys (cascade).

**Request**

```http
DELETE /products/SKU-000123
```

**Response**

```http
204 No Content
```

**Errors:** `400 VALIDATION_FAILED` · `404 PRODUCT_NOT_FOUND`

---

### GET /health

Liveness check. Performs `SELECT 1` against the database.

**Request**

```http
GET /health
```

**Response**

```http
200 OK

{ "status": "ok" }
```

**Errors:** `503 DATABASE_UNAVAILABLE`

---

## Error body

All errors use `Content-Type: application/problem+json`.

```http
409 Conflict
Content-Type: application/problem+json

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

The `type` field is a relative URI pointing at the error entry in this catalogue. `VALIDATION_FAILED` bodies include an `errors` array of `{ field, message }` pairs.

---

## Error catalogue

| `code` | Status | When it fires |
|---|---|---|
| `VALIDATION_FAILED` | 400 | A field fails format, type or range validation; unknown field present; `Idempotency-Key` header missing or malformed |
| `PRODUCT_NOT_FOUND` | 404 | No product exists with the given `productToken` |
| `PRODUCT_TOKEN_ALREADY_EXISTS` | 409 | `POST /products` with a `productToken` that is already in use |
| `INSUFFICIENT_STOCK` | 409 | The delta would take stock below zero; `available` field is present (advisory, point-in-time) |
| `STOCK_LIMIT_EXCEEDED` | 409 | The delta would take stock past the signed `INT` maximum |
| `IDEMPOTENCY_KEY_REUSE` | 409 | The same `Idempotency-Key` was sent with a different payload |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | 409 | A request carrying this `Idempotency-Key` is still being processed |
| `CONCURRENT_MODIFICATION` | 409 | A lock-wait timeout or deadlock was resolved against this transaction; `Retry-After: 1` header present |
| `DATABASE_UNAVAILABLE` | 503 | The service cannot reach its database |
| `HTTP_ERROR` | varies | A framework-level error (malformed JSON, unknown route, wrong method) |
| `INTERNAL_ERROR` | 500 | An unhandled error; no internals are exposed |
