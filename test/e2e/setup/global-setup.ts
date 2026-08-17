import { Sequelize } from 'sequelize';
import { closeMigrationConnection, migrator } from '../../../db/umzug';

async function waitForDatabase(): Promise<void> {
  // MySQL accepts TCP before it accepts queries; retry rather than assume.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const sequelize = new Sequelize({
      dialect: 'mysql',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 3307),
      database: process.env.DB_NAME ?? 'ecommerce_test',
      username: process.env.DB_USER ?? 'products',
      password: process.env.DB_PASSWORD ?? 'products',
      logging: false,
    });
    try {
      await sequelize.authenticate();
      await sequelize.close();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('The database did not become available in time.');
}

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME ??= 'ecommerce_test';
  await waitForDatabase();
  await migrator.up();
  // The runner opened a connection at import time; Jest would stay alive on it.
  await closeMigrationConnection();
}
