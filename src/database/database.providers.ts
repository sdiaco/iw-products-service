import type { Provider } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { ENV } from '../config/config.module';
import type { EnvSchema } from '../config/env.schema';
import { SEQUELIZE } from './database.tokens';

export const sequelizeProvider: Provider = {
  provide: SEQUELIZE,
  inject: [ENV],
  useFactory: async (env: EnvSchema): Promise<Sequelize> => {
    const sequelize = new Sequelize({
      dialect: 'mysql',
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
      // Without this, timestamps depend on the container's time zone.
      timezone: '+00:00',
      logging: false,
      pool: { max: env.DB_POOL_MAX, min: 0, idle: 10_000 },
    });
    await sequelize.authenticate();
    return sequelize;
  },
};
