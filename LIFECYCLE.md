# LIFECYCLE.md — How this project was built

| # | Step | Status | Date |
|---|------|--------|------|
| 1 | Engineering rules | done | 2026-08-14 |
| 2 | Design | done | 2026-08-14 |
| 3 | Implementation plan | done | 2026-08-14 |
| 4 | Foundations | done | 2026-08-15 |
| 5 | Create a product | in progress | 2026-08-15 |

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

**Done** `docs/design/2026-08-14-products-service-design.md`: fifteen recorded
decisions, six endpoints with their error catalogue, DTOs, the DDL for
`products` and `idempotency_keys`, the stock update flow step by step, the test
plan, and the pinned stack.

**Why** The brief leaves stock semantics and pagination open: I chose a signed
delta and `page`/`size`. Delta models the real event and makes the atomic
update and the idempotency key necessary rather than decorative. I kept the
tree feature-first and rejected `controllers/` at the root — it splits one
change across three trees — but mandated the same three layers inside every
module, which is the standardisation I actually wanted. I dropped the abstract
repository port: with one implementation, the real boundary is the shape of the
methods plus a lint rule confining the ORM. I pinned TypeScript 5.9 over 7.0
because `typescript-eslint` and `ts-jest` both exclude it.

**AI** I ran this as a question-driven session with Claude and decided each
fork myself. It caught the unsigned-arithmetic problem on `stock` and the
snapshot read under `REPEATABLE READ`; I verified both. I pushed back on the
first structure it proposed and we cut it down.

**Next** Implementation plan, then the first vertical slice.

## 3 — Implementation plan · 2026-08-14

**Goal** Turn the design into steps I can execute without deciding anything
again while I code.

**Done** `docs/design/2026-08-14-implementation-plan.md`: 29 tasks in seven
vertical slices, each with the code, the command to run and the expected
output.

**Why** I ordered the slices so the repository is a valid submission from the
end of the delete endpoint onward, and put idempotency last because it is the
only part the brief does not ask for — if I run out of time it is the piece to
drop, and I would rather drop it whole than deliver it half-built. Writing the
code out in advance caught three things the design had missed, including that
the service cannot import the ORM it needs for transactions.

**AI** Claude drafted the plan from the design; I cut the parts that were
gold-plating and set the slice order myself.

**Next** Implementation.

## 4 — Foundations · 2026-08-15

**Goal** Get everything standing that the endpoints need: toolchain,
containers, config, errors, schema, bootstrap.

**Done** Branch `feat/products-service`. Compose (MySQL → migrations → API),
validated environment, the RFC 9457 error layer, Sequelize providers, both
tables, `GET /health`, the e2e harness. `make check` and `make e2e` green.

**Why** Every command runs in a container: the host's Node is not the one that
ships. Two findings changed the design. The `.ts` migrations do not run
natively — Node reads them as ESM, where `__dirname` does not exist — so they
are compiled. And a named unique constraint written the obvious way is silently
discarded by Sequelize: `productToken` had no unique index and no error. I
found it by asking the database, not by re-reading the migration.

**AI** A fresh agent per task, every claim checked against the repository — two
reported the same contradiction that did not exist. I rejected three of their
changes: a shell guard hiding an empty source tree, a lint exemption widened so
a controller could import the ORM, and a polyfill put in a domain file. Ten
rules went into `AGENTS.md`, one per incident.

**Next** The create endpoint.

## 5 — Create a product · 2026-08-15

**Goal** `POST /products`, with validation, the duplicate-token conflict, and
both kinds of test.

**Done** In progress.

**Next** Reading and listing products.
