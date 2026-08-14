import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  collectCoverageFrom: ['src/**/*.ts'],
  // emitDecoratorMetadata makes TypeScript emit Reflect.metadata() calls, so the
  // polyfill must load before any decorated class is defined. main.ts does this
  // for the running app; this does it for every test, once.
  setupFiles: ['reflect-metadata'],
};

export default config;
