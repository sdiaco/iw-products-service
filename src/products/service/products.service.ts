import { Injectable } from '@nestjs/common';
import type { NewProduct, Product } from '../product';
import { ProductRepository } from '../repository/product.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductRepository) {}

  create(input: NewProduct): Promise<Product> {
    return this.products.create(input);
  }
}
