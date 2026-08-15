import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/e2e'],
  // Default testMatch requires "spec"/"test" preceded by a dot; the NestJS
  // "*.e2e-spec.ts" convention has a hyphen there instead, so it needs its own regex.
  testRegex: '\\.e2e-spec\\.ts$',
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.ts',
  testTimeout: 30_000,
  // emitDecoratorMetadata makes TypeScript emit Reflect.metadata() calls, so the
  // polyfill must load before any decorated class is defined.
  setupFiles: ['reflect-metadata'],
};

export default config;
