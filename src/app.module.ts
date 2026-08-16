import { Module } from '@nestjs/common';
import { AppLogger } from './common/logging/app-logger';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, ProductsModule],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppModule {}
