import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? 'ecommerce',
  username: process.env.DB_USER ?? 'products',
  password: process.env.DB_PASSWORD ?? 'products',
  logging: false,
});

export const migrator = new Umzug({
  // Production (`pnpm migrate`) compiles to CommonJS first and runs the .js
  // output, so only .js files exist next to this file at runtime there. Under
  // ts-jest (the e2e harness), this module is required directly as .ts and
  // only .ts files exist next to it — ts-jest transforms it through Jest's
  // module registry, and Umzug's default resolver falls back to `require()`
  // for a `.ts` path when `require.main` is defined (true in both Node and
  // Jest), so that `require()` is intercepted by ts-jest's transform too.
  // One glob covering both extensions lets the same file serve both paths.
  migrations: { glob: ['migrations/*.{js,ts}', { cwd: __dirname }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

export type Migration = typeof migrator._types.migration;

if (require.main === module) {
  migrator
    .runAsCLI()
    .then(() => sequelize.close())
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
