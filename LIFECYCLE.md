# LIFECYCLE.md — How this project was built

| # | Step | Status | Date |
|---|------|--------|------|
| 1 | Engineering rules | done | 2026-08-14 |
| 2 | Design | done | 2026-08-14 |
| 3 | Implementation plan | done | 2026-08-14 |
| 4 | Foundations | done | 2026-08-15 |
| 5 | CRUD endpoints | done | 2026-08-15 |
| 6 | Atomic stock update | done | 2026-08-15 |
| 7 | Idempotent stock requests | done | 2026-08-15 |
| 8 | Delivery | done | 2026-08-15 |

## 1 — Engineering rules · 2026-08-14

**Goal** Fix the conventions I want to be held to before writing any code.

**Done** `AGENTS.md` with rules for TypeScript, naming, errors, async and data,
security, testing, documentation and git. `ASSESSMENT.md` describing how this
file is kept.

**Why** I wrote the rules first so that later choices could be checked against
something instead of my mood at the time. I deliberately kept `AGENTS.md` to
conventions only and pushed every project-specific fact into `docs/`, because a
file that mixes the two goes stale in both halves.

**AI** I drafted the rules with Claude and edited them. I cut the parts that
described this specific project — that is what `docs/` is for.

**Next** Design.

## 2 — Design · 2026-08-14

**Goal** Settle behaviour, contracts, schema and test strategy before coding.

**Done** `docs/design/2026-08-14-products-service-design.md`: the recorded
decisions, six endpoints with their error catalogue, DTOs, the DDL, the stock
update flow step by step, the test plan and the pinned stack.

**Why** The brief leaves stock semantics and pagination open: I chose a signed
delta and `page`/`size`. Delta models the real event, which makes atomicity and
the idempotency key necessary rather than decorative. I kept the tree
feature-first — `controllers/` at the root splits one change across three trees
— with the same three layers inside every module. I dropped the abstract
repository port: the boundary is the method shape plus a lint rule.

**AI** A question-driven session with Claude; I decided each fork myself. It
caught the unsigned-arithmetic problem on `stock` and the snapshot read under
`REPEATABLE READ`, and I verified both.

**Next** Implementation plan, then the first vertical slice.

## 3 — Implementation plan · 2026-08-14

**Goal** Turn the design into steps I can execute without deciding anything
again while I code.

**Done** `docs/design/2026-08-14-implementation-plan.md`: 29 tasks in seven
vertical slices, each with the code, the command to run and the expected
output.

**Why** I ordered the slices so the repository is a valid submission from the
end of the delete endpoint onward, and put idempotency last because it is the
only part the brief does not ask for. Writing the code out in advance caught 
three things the design had missed, including that the service cannot import 
the ORM it needs for transactions.

**AI** Claude drafted the plan from the design; I cut the parts that were
gold-plating and set the slice order myself.

**Next** Implementation.

## 4 — Foundations · 2026-08-15

**Goal** Stand up everything the endpoints need before writing one.

**Done** Branch `feat/products-service`. Compose (MySQL → migrations → API),
validated environment, the RFC 9457 error layer, Sequelize providers, both
tables, `GET /health`, the e2e harness. `make check` and `make e2e` green.

**Why** Every command runs in a container: the host's Node is not the one that
ships. Two findings changed the design. The `.ts` migrations do not run
natively — Node reads them as ESM, without `__dirname` — so they are compiled.
And a named unique constraint written the obvious way is silently discarded by
Sequelize: `productToken` had no unique index and no error. I found it by
asking the database, not by re-reading the migration.

**AI** A fresh agent per task, every claim checked against the repository — two
reported the same contradiction that did not exist. I rejected three changes: a
guard hiding an empty source tree, a lint exemption widened so a controller
could import the ORM, a polyfill put in a domain file.

**Next** The create endpoint.

## 5 — CRUD endpoints · 2026-08-15

**Goal** All five product endpoints working, validated and tested.

**Done** Create, list, get, delete — each built bottom-up (repository → service
→ controller → e2e). Validation rejects unknown fields, three-decimal prices,
whitespace names, malformed tokens. The duplicate-token conflict fires from a
real unique constraint, not application logic.

**Why** I built vertically — one endpoint at a time, fully tested, rather than
all repositories then all services. Each commit stands alone. The order
(create → read → delete) gave the tests a seeded database naturally.

**AI** A fresh subagent per task, then a spec-compliance review and a quality
review by two separate subagents. One reviewer incorrectly claimed return types
were missing — verified on disk and dismissed. The `async` without `await`
pattern was caught and fixed before commit.

**Next** The stock update.

## 6 — Atomic stock update · 2026-08-15

**Goal** A stock change that survives twenty concurrent requests.

**Done** `TransactionRunner` in `database/`, a lint rule that allows
type-only Sequelize imports in the service, the single conditional `UPDATE` in
the repository, the service flow (lock timeout → apply → classify failure →
read back), the endpoint, and a concurrency proof: 20 parallel decrements
against stock 10 end at zero with exactly 10 successes.

**Why** The guard in the WHERE clause makes the database the authority — no
application-level read-modify-write. The 3-second lock wait timeout ensures
the 409 arrives before the client gives up. The `FOR UPDATE` on the
diagnostic read is necessary under `REPEATABLE READ` or it reads a snapshot.

**AI** Two subagent batches: infrastructure (runner + lint boundary + conditional
update) then service + endpoint. The quality reviewer confirmed zero
architecture violations. The implementer added `FOR UPDATE` to the
idempotency INSERT subquery to prevent shared-lock deadlocks under load —
a deviation I verified and accepted.

**Next** Idempotency.

## 7 — Idempotent stock requests · 2026-08-15

**Goal** A retried stock request applies the delta once.

**Done** The idempotency repository (INSERT...SELECT registers the key and
checks the product in one statement), the header decorator, the service
rewrite (check → register → apply → store → commit, rollback on failure
deletes the key), and end-to-end tests for replay, reuse, rollback, and
cascade deletion.

**Why** A delta applied twice is a data-integrity bug. The key must share the
transaction with the effect: if the effect fails, the key disappears, so a
retry is executed rather than replaying a failure forever. A stored 409 after
a restock would be permanent corruption.

**AI** Two subagent batches. The implementer correctly identified that the
INSERT...SELECT needed `FOR UPDATE` on the subquery to prevent a deadlock
in the concurrency test. I renamed the DTO files (dropped mechanism suffixes)
and the model file after the reviews passed.

**Next** Documentation and delivery.

## 8 — Delivery · 2026-08-15

**Goal** A reviewer can start, test and understand the service from a clean clone.

**Done** The idempotent seed (5 products, including zero-stock and free), the
README with sample requests, `docs/architecture.md`, `docs/api.md` with the
full error catalogue, three ADRs, and a Bruno API collection. Verified by
`docker compose up` from scratch: migrations, seed, all endpoints responding.

**Why** Documentation is scored. A repository without a working README fails
before the code is read. The seed includes edge cases (free product, zero
stock) because those are the first things a reviewer tries.

**AI** Two parallel subagents: one for the seed, one for all documentation.
Both read the actual source files to ensure accuracy. I created the Bruno
collection manually and verified the full stack end-to-end.

**Next** Panel preparation (local only, not committed).
