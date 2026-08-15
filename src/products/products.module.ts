import { Module } from '@nestjs/common';
import { ProductsController } from './controller/products.controller';
import { idempotencyModelProvider } from './repository/models/idempotency.model';
import { productModelProvider } from './repository/models/product.model';
import { IdempotencyRepository } from './repository/idempotency.repository';
import { ProductRepository } from './repository/product.repository';
import { ProductsService } from './service/products.service';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductRepository,
    productModelProvider,
    IdempotencyRepository,
    idempotencyModelProvider,
  ],
})
export class ProductsModule {}
