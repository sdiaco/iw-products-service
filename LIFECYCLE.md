# LIFECYCLE.md — How this project was built

| # | Step | Status | Date |
|---|------|--------|------|
| 1 | Engineering rules | done | 2026-08-14 |
| 2 | Design | done | 2026-08-14 |
| 3 | Implementation plan | done | 2026-08-14 |
| 4 | Implementation | in progress | 2026-08-14 |

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

## 4 — Implementation · 2026-08-14

**Goal** Build the service slice by slice, tests written with the code.

**Done** In progress. Branch `feat/products-service`.

**Why** I work on a branch rather than on main so the analysis and the build
read as two separate things in the history.

**AI** Each task is implemented by a fresh agent given only that task, then
reviewed twice — once against the specification, once for code quality. I read
every deviation myself: the first one I rejected was a shell guard slipped into
the `typecheck` script to work around an empty source tree.

**Next** Delivery.
