import { Module } from '@nestjs/common';
import { ProductsController } from './controller/products.controller';
import { productModelProvider } from './repository/models/product.model';
import { ProductRepository } from './repository/product.repository';
import { ProductsService } from './service/products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository, productModelProvider],
})
export class ProductsModule {}
