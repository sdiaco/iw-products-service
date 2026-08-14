# LIFECYCLE.md — How this project was built

| # | Step | Status | Date |
|---|------|--------|------|
| 1 | Engineering rules | done | 2026-08-14 |
| 2 | Design | done | 2026-08-14 |
| 3 | Implementation plan | in progress | 2026-08-14 |

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

**Why** The brief leaves stock semantics and pagination open, so I chose a
signed delta and `page`/`size`. Delta because it models the real event and
makes the atomic update and the idempotency key necessary rather than
decorative. I rejected a slug-shaped `productToken` — identity and presentation
are different concerns — and I pinned TypeScript 5.9 rather than the current
7.0 because `typescript-eslint` and `ts-jest` both declare peer ranges that
exclude it.

**AI** I ran the analysis as a question-driven session with Claude, deciding
each fork myself. It caught the unsigned-arithmetic problem on `stock` and the
snapshot read under `REPEATABLE READ`; I verified both. I asked for a critical
review at every step and rejected the parts that were over-built.

**Next** Implementation plan, then the first vertical slice.
