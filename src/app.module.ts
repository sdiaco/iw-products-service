import { Module } from '@nestjs/common';
import { AppLogger } from './common/logging/app-logger';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppModule {}
