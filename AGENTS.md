# AGENTS.md — Engineering rules

Rules for AI coding agents working in this repository. This file holds
**conventions only** — how code is written, tested, documented and committed.

What this project *is*, what it decides and why, lives in [docs/](./docs). The
design document under `docs/design/` is the authority on contracts and
behaviour; ADRs under `docs/decisions/` record the choices behind them. When
this file and `docs/` disagree about a project-specific fact, `docs/` wins.

[ASSESSMENT.md](./ASSESSMENT.md) governs how [LIFECYCLE.md](./LIFECYCLE.md) is
kept. A new step of work `MUST` be recorded there when it begins.

**Conventions:** `MUST`/`MUST NOT` mandatory; `SHOULD`/`SHOULD NOT`
recommended, deviations require justification. RFC 2119.

**Language:** code, comments, identifiers, commits and docs `MUST` be English.

---

## 1. Autonomy

| Level | Actions |
|---|---|
| **Always proceed** | Writing code and tests, refactoring within a file, fixing failing code, naming improvements |
| **Ask first** | DB schema changes, adding or upgrading dependencies, build and CI config, a new architectural layer, altering a public contract, deleting a test |
| **Never** | Committing secrets or `.env`, disabling lint or type checks, adding a dependency to avoid ten lines, weakening a test to make it pass |

Changing a test is legitimate only when the expected behaviour itself changed —
state that in the commit.

## 2. Architecture

**Layout.** The tree is organised feature-first: the root of `src/` is a map of
the domains, not of the layers. Every domain module `MUST` contain exactly
`controller/`, `service/` and `repository/`, so the internal shape is the same
in every module and in every service. Cross-cutting code lives outside the
domain modules (`common/`, `config/`, `database/`).

Grouping directories by language construct or by framework mechanism —
`types/`, `interfaces/`, `filters/` — `MUST NOT` be used. A type lives with the
layer that owns it; a type shared by two layers of one module lives at that
module's root. Ambient declarations (`*.d.ts`) are the only exception, since
they belong to no layer.

**Boundaries.**

- Layer boundaries `MUST` be enforced by tooling, not by discipline alone
  (`import-x/no-restricted-paths`). A rule nobody can break by accident is
  worth more than a rule written down.
- The transport layer `MUST NOT` contain business rules, and business code
  `MUST NOT` know the transport — no request or response objects, no status
  codes.
- Persistence models `MUST NOT` be serialised outward. Responses are explicit
  types listing their fields, so a new column cannot leak into the API.
- The ORM `MUST NOT` be importable outside the data-access layer
  (`no-restricted-imports`).
- A repository's public signatures `MUST` be expressed in domain terms.
  `applyStockDelta(token, delta, tx)` is a boundary; `update(where, values)` is
  the ORM wearing a different name. The transaction handle is the single
  deliberate exception.

**Dependencies.**

- Dependencies `MUST` be injected, never constructed inline.
- A dependency `SHOULD` be depended upon as a concrete class until a second
  implementation exists. An abstract port with one implementer buys nothing
  that the shape of its methods and a lint rule do not already buy.
- A new abstraction `MUST` be explainable in one sentence. An interface with a
  single implementation and no second use case is a cost, not a design.

## 3. TypeScript

- `strict` on, never relaxed per file.
- `any` `MUST NOT` be used — use `unknown` and narrow.
- The non-null assertion operator (`value!.field`) `MUST NOT` be used. The
  definite-assignment assertion on a validated DTO field (`readonly x!: string`)
  is allowed, because the validator is what populates it.
- Exported functions `MUST` declare their return type.
- Fields never reassigned `MUST` be `readonly`.
- Types `SHOULD` make invalid states unrepresentable.

## 4. Naming

| Subject | Convention |
|---|---|
| Files | `kebab-case` |
| Types, classes | `PascalCase` |
| Functions, variables | `camelCase` |
| Constants | `UPPER_SNAKE_CASE` |
| Tables / columns | lowercase plural / `camelCase` |

Booleans read as predicates (`isActive`, `hasStock`). No abbreviations, no
type-encoding in names. One concept keeps one name across every layer.

## 5. Functions and readability

- One thing per function, named for that thing, no hidden side effects.
- Parameters `MUST NOT` be mutated — return new values.
- Three or four parameters at most; beyond that, an options object.
- Early return over nesting; a complex ternary becomes `if`/`else`.
- Meaningful literals `MUST` be named constants.
- Dead code `MUST` be removed — git is the safety net.

## 6. Error handling

- Typed error classes extending a shared base — no bare `Error`, no strings,
  no untyped objects.
- Translation from domain error to transport error happens **once**, at the
  outer boundary. Unmapped errors surface as a generic `500`.
- Responses `MUST NOT` expose stack traces, query text or schema details.
- Driver and constraint violations (`ER_DUP_ENTRY`, foreign keys) `MUST` be
  translated into domain errors by the layer that knows the driver.
- An empty `catch` `MUST NOT` exist.

## 7. Async and data

- Every promise `MUST` be awaited or returned; `async` only on functions that
  await.
- A single statement is already atomic; a transaction `MUST` be opened when,
  and only when, more than one statement must succeed or fail together.
- Transactions `MUST` be passed explicitly rather than propagated implicitly,
  so a signature states what participates.
- Mutations of a contended value `MUST` be atomic — one conditional `UPDATE`,
  never read-modify-write.
- A retryable non-idempotent operation `MUST` be protected by an idempotency
  key, and the record of that key `MUST` share the transaction of the effect
  it protects.
- Constraints (uniqueness, nullability, ranges) `MUST` be enforced at database
  level, not only in validation.
- Queries `MUST` be parameterised. Money is a fixed-point decimal, never a
  float, and crosses the wire as a string.

## 8. Security

- Secrets come from the environment only; `.env` is not committed,
  `.env.example` is.
- Configuration `MUST` be validated at startup and fail fast.
- External input `MUST` be validated at the boundary, rejecting unknown fields.
- Secrets, credentials and PII `MUST NOT` be logged.

## 9. Testing

- Tests live under `test/`, split into `test/unit/` and `test/e2e/`. The unit
  tree mirrors `src/`, so `src/` holds production code only and the two kinds
  of test are told apart from the root.
- A unit test isolates its unit: I/O collaborators are substituted, pure ones
  are left real.
- End-to-end tests run real migrations against a real database. `sync()`
  `MUST NOT` be used, in application code or in tests.
- Failure and edge cases `MUST` be covered — boundaries, constraint
  violations, absent resources, invalid input, concurrent access.
- One behaviour per test, and the name states that behaviour.
- Tests `MUST` be deterministic, order-independent, and pass from a clean
  checkout through `docker compose`.
- Every command — install, lint, type-check, test, migrate, run — `MUST` be
  executed inside a container. The host's runtime is not the one that ships, so
  a green run on the host is weaker evidence than it looks. A single entry
  point (a `Makefile` target) `SHOULD` wrap each one.

## 10. Comments and documentation

- Comments explain *why*, not *what*.
- No commented-out code, no `TODO` or `FIXME` on the main branch.
- JSDoc covers the public surface only and `MUST NOT` restate types.
- A line that looks wrong and is correct carries an inline `// why`.
- The README covers prerequisites, setup, run, test, and a request and
  response example per endpoint.
- Decisions are recorded as ADRs in `docs/decisions/`.

## 11. Git

- Conventional Commits: `type(scope): subject`, imperative, 72 characters max,
  no trailing period.
- Body optional, and a bullet list when present — no prose.
- Branches: `type/short-description`, kebab-case.
- One logical change per commit, with lint, build and tests green.
- The lockfile is committed; secrets, build output and editor config are not.
- Trailers `MUST NOT` credit tooling — AI use is recorded in `LIFECYCLE.md`.

## 12. Principles (tiebreakers)

**KISS** · **YAGNI** · **DRY** (knowledge, not shape) · **SOLID** ·
**Boy Scout rule**, scoped to the area being worked on.

Above all: **explainability**. Every line must be justifiable in one sentence.
Over-building counts against.
