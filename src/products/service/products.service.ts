import { Injectable } from '@nestjs/common';
import type { NewProduct, Page, Product } from '../product';
import { ProductNotFoundError } from '../products.errors';
import { ProductRepository } from '../repository/product.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductRepository) {}

  create(input: NewProduct): Promise<Product> {
    return this.products.create(input);
  }

  async get(productToken: string): Promise<Product> {
    const product = await this.products.findByToken(productToken);
    if (product === null) {
      throw new ProductNotFoundError(productToken);
    }
    return product;
  }

  async list(page: number, size: number): Promise<Page<Product>> {
    const { items, total } = await this.products.findPage(page, size);
    return { items, meta: { page, size, total, totalPages: Math.ceil(total / size) } };
  }
}
