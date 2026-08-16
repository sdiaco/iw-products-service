# ADR-0001: Idempotency key required for stock updates

Date: 2026-08-15 · Status: accepted

## Context

`PATCH /products/:token/stock` applies a signed delta to a product's stock. HTTP does not make PATCH idempotent by default, and network or server failures are common enough that clients retry failed requests. Without a guard, a retried delta would be applied twice — a second deduction of three units is not the same as the first; it changes the outcome.

The service must distinguish "this is a new request" from "this is the same request I already processed". The only information that can make that distinction is something the client supplies, because the client is the one who knows whether a request is new or a retry.

## Decision

`PATCH /products/:token/stock` requires an `Idempotency-Key` header validated against `^[A-Za-z0-9_.:-]{8,255}$`. The key is stored with a SHA-256 hash of the serialised request payload. On a repeat:

- Same key, same hash, stored response present → replay the stored response verbatim; the delta is not applied again.
- Same key, different hash → `409 IDEMPOTENCY_KEY_REUSE`; the client used the same token for two different operations, which is a client error.
- Same key, no stored response → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`; the first request is still in flight.

On failure, the idempotency record is **rolled back** with the transaction. A failed request produced no effect, and a stored failure would replay forever — including after the client restocks to make the delta valid. The client retries with the same key and the request is executed again.

The key is required (not optional) because an optional header would mean the service applies the delta twice when the client omits it under load, and a header the service ignores is not idempotency.

## Consequences

- Clients must generate and supply an idempotency key for every stock update. The format is deliberately lenient (any URL-safe string, 8–255 chars) so that UUIDs, ULIDs and order-line identifiers all qualify.
- A key is valid for 24 hours; after that, a record is treated as absent and the request is executed. A legitimate retry arrives within seconds, so the window is three orders of magnitude wider than needed.
- Idempotency keys are never deleted. A separate purge job (one `DELETE … LIMIT 10000` on a schedule) is the right tool; it is documented but not implemented.
- The `CONCURRENT_MODIFICATION` error carries `Retry-After: 1`. The idempotency record was rolled back, so retrying with the same key is safe immediately.

## Alternatives rejected

**Make the key optional.** Clients that omit it would receive no protection. The header's value is that it is contractually required — an opt-in is an opt-out under pressure.

**Use a request fingerprint instead of a client key.** A fingerprint (hash of the body) cannot distinguish the first application of a delta from a legitimate second application of the same delta (e.g. selling one unit twice). The client is the one who knows which it is.

**Store idempotency outside the transaction.** Writing the record outside the stock update's transaction opens a window between the commit and the store where a concurrent retry cannot see the record and applies the delta a second time. The record must share the transaction to close that window.
