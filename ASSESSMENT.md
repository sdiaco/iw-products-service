# ASSESSMENT.md — How to keep LIFECYCLE.md

Engineering rules live in [AGENTS.md](./AGENTS.md). This file governs one thing: how [LIFECYCLE.md](./LIFECYCLE.md) is written and maintained.

---

## Purpose

`LIFECYCLE.md` records how this project was built — what was done, how, why, when. Its reader is the reviewing panel: competent people who see the finished repo but not the path to it. The code shows the destination; this file shows the reasoning.

## When to write

Append an entry **when a new step begins, before starting it**. Close it when the step ends.

A step = a change in the *kind* of work (defining rules, choosing the stack, designing data, implementing a slice, writing tests, preparing delivery). Not every commit — if entries outnumber commits, granularity is wrong.

Entries `MUST` be written as work happens. Reconstructing at the end hides the decisions.

## Entry structure

Five fields, in order. Omit only when genuinely empty.

| Field | Content |
|---|---|
| **Goal** | What this step sets out to settle, one sentence |
| **Done** | What was produced — files, decisions, structures |
| **Why** | Options considered, what was chosen, what was rejected and why |
| **AI** | Where AI was used, what was reviewed/overridden, what was written by hand |
| **Next** | What this step unblocks |

**Why** is the field that matters — a step recording only *what* is a changelog, and git already provides one.

**AI** is required, not optional. The brief states every line must be explainable and AI use is of genuine interest.

## Format

Index table at top, one section per step below, newest last.

```markdown
| # | Step | Status | Date |
|---|------|--------|------|
| 1 | Engineering rules | done | 2026-08-12 |

## 1 — Engineering rules · 2026-08-12

**Goal** …
**Done** …
**Why** …
**AI** …
**Next** …
```

Status: `in progress` · `done` · `abandoned`. Abandoned steps stay with the reason — a reversed decision is evidence of judgement.

## Writing rules

- English, simple, short sentences. Write it to be read out loud.
- **First person** — "I chose", "I rejected".
- **≤ 15 lines per entry** (all five fields). Past that, split the step.
- Name concrete things: files, decisions, numbers. "Improved the structure" records nothing.
- No self-assessment — say what and why; the panel judges.
- Write nothing that is not true.
