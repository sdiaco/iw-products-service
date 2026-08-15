import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { DatabaseHealth } from './database.health';
import { sequelizeProvider } from './database.providers';
import { SEQUELIZE } from './database.tokens';

@Global()
@Module({
  providers: [sequelizeProvider, DatabaseHealth],
  exports: [SEQUELIZE, DatabaseHealth],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  /**
   * Nest closes the HTTP server before firing this, so in-flight requests
   * finish before the pool goes away. Without it the pool's idle timer keeps
   * the process alive after the server has stopped.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.sequelize.close();
  }
}
