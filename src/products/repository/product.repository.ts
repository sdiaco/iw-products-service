import { Inject, Injectable } from '@nestjs/common';
import { UniqueConstraintError } from 'sequelize';
import { PRODUCT_MODEL } from '../../database/database.tokens';
import type { NewProduct, Product } from '../product';
import { ProductTokenAlreadyExistsError } from '../products.errors';
import { ProductModel, toProduct } from './models/product.model';

@Injectable()
export class ProductRepository {
  constructor(@Inject(PRODUCT_MODEL) private readonly model: typeof ProductModel) {}

  async create(input: NewProduct): Promise<Product> {
    try {
      const row = await this.model.create({ ...input });
      return toProduct(row);
    } catch (error) {
      // Sequelize wraps MySQL's ER_DUP_ENTRY; the layer that knows the driver translates it.
      if (error instanceof UniqueConstraintError) {
        throw new ProductTokenAlreadyExistsError(input.productToken);
      }
      throw error;
    }
  }
}
