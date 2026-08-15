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
  // Node cannot run this file's ESM-detected .ts source directly (__dirname is
  // undefined there); the migrate script compiles to CommonJS first, so the
  // glob targets the compiled output alongside this file.
  migrations: { glob: ['migrations/*.js', { cwd: __dirname }] },
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
