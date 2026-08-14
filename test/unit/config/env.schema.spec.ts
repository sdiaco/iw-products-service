import { validateEnv } from '../../../src/config/env.schema';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'mysql',
  DB_PORT: '3306',
  DB_NAME: 'ecommerce',
  DB_USER: 'products',
  DB_PASSWORD: 'products',
  DB_POOL_MAX: '25',
};

describe('validateEnv', () => {
  it('coerces numeric variables to numbers', () => {
    expect(validateEnv(valid).PORT).toBe(3000);
  });

  it('rejects a missing database host', () => {
    const { DB_HOST, ...withoutHost } = valid;
    expect(() => validateEnv(withoutHost)).toThrow(/DB_HOST/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
