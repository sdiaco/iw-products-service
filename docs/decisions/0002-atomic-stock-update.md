# ADR-0002: Atomic stock update via conditional UPDATE

Date: 2026-08-15 · Status: accepted

## Context

Stock mutations are a contended resource: two concurrent requests can both read the current stock (e.g. 3), both decide the delta (-3) is valid, and both apply it — leaving stock at -3. Three decisions shape how this service avoids that:

1. What the caller sends (delta vs. absolute value).
2. How the mutation is applied (conditional statement vs. read-modify-write).
3. What happens when the delta would violate a constraint (reject vs. clamp).

## Decision

**Delta, not absolute set.** The stock update endpoint accepts a signed `delta` (`+n`, `-n`). The caller sends the change that happened (a sale, a return, a correction), not the desired end state.

**One conditional `UPDATE`.** The delta is applied in a single statement:

```sql
UPDATE products
   SET stock = stock + :delta,
       updatedAt = :now
 WHERE productToken = :token
   AND stock + :delta >= 0
   AND stock + :delta <= 2147483647
```

The guard lives in the `WHERE` clause, so two concurrent requests cannot both succeed on the last unit: only one will match the row, and the other will see zero rows affected. There is no window between the read and the write, because there is no separate read.

**Reject, never clamp.** If the delta would take stock below zero, the request fails with `409 INSUFFICIENT_STOCK`. The response carries an `available` field (advisory, point-in-time, read inside the same transaction). Clamping silently to zero would mean losing units the caller expected to deduct — a data-integrity defect in a domain that handles money.

## Consequences

- Callers must handle `409 INSUFFICIENT_STOCK` and decide whether to retry with a different delta or surface the failure.
- `available` in the error body is point-in-time: a concurrent commit may change it before the client reads it. It explains the failure; it does not constitute a reservation.
- `stock` is a signed `INT` (not `UNSIGNED`) so that `stock + :delta >= 0` evaluates correctly in signed arithmetic. With `UNSIGNED`, MySQL raises `ER_DATA_OUT_OF_RANGE` instead of simply not matching the row.
- A `CHECK (stock >= 0)` constraint is declared at the database level as a secondary guard. A service restart that bypasses the application layer cannot produce negative stock.
- Zero is rejected as a delta (it would produce zero affected rows and be indistinguishable from a failure).

## Alternatives rejected

**Absolute set.** An absolute value (`{ "stock": 7 }`) cannot be made idempotent without knowing the value before the call: two concurrent requests both setting stock to 7 look identical but one is wrong if the first already applied. A delta — "remove 3" — is safe to replay because the idempotency key is the guard, not the payload value.

**Read-modify-write.** Reading the current stock, computing the new value in application code, and writing it back is a classic TOCTOU race. Two transactions would both read the old value and both compute a valid result, and both commits would succeed — leaving the stock incorrect. The conditional `UPDATE` eliminates the window entirely.

**Clamp to zero.** Clamping is a silent decision taken for the caller: the sale was partially applied (some units deducted, the rest not), and the caller has no way to know. A `409` makes the constraint explicit and leaves the caller in control.
