/** Upper bound matches the productToken VARCHAR(64) column. */
export const PRODUCT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** DECIMAL(10,2): eight integer digits, at most two decimals. */
export const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
/** Upper bound matches the idempotencyKey VARCHAR(255) column. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,255}$/;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const INT_MAX = 2_147_483_647;
/**
 * Enforced on read: an expired record counts as absent, so the request runs rather than replays.
 * Expired rows are never deleted by the service.
 */
export const IDEMPOTENCY_RETENTION_HOURS = 24;
/** InnoDB waits 50s by default; the client would give up long before the 409. */
export const STOCK_LOCK_WAIT_SECONDS = 3;
