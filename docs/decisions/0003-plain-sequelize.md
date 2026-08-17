# ADR-0003: Plain Sequelize with hand-written providers

Date: 2026-08-15 · Status: accepted

## Context

The assessment brief mandates Sequelize as the ORM. NestJS has a first-party integration package (`@nestjs/sequelize`) that wraps the setup, provides module-level imports, and injects models as providers automatically. The question is whether to use it or wire Sequelize directly.

## Decision

Use `sequelize` directly. The `DatabaseModule` instantiates a `Sequelize` instance through a hand-written factory provider (`database.providers.ts`) and exposes it via an injection token (`SEQUELIZE`). Repositories inject this token explicitly.

`@nestjs/sequelize` is not installed.

## Consequences

- The Sequelize factory is visible: connection parameters, pool settings, model registration and timezone configuration are all in one readable file rather than distributed across module decorators.
- Dependency injection is explicit: what gets injected, where, and under what token is stated in code rather than implied by a module decorator.
- No additional abstraction sits between application code and the ORM, so behaviour under edge cases (transaction options, lock hints, session-level variables) is easier to reason about and debug.
- There is one extra file (`database.providers.ts`) compared to the `@nestjs/sequelize` approach. The tradeoff is accepted: a provider that is ten lines and fully explicit is cheaper to maintain than a module decorator that hides the same ten lines.

## Alternatives rejected

**`@nestjs/sequelize`.** The brief asks for the `sequelize` package; using the wrapper adds a dependency that is not asked for. More significantly, the wrapper obscures how dependency injection works — models are injected as `@InjectModel(ModelClass)`, which is framework magic rather than a named token. Hand-wired providers show the mechanism the assessment is testing.
