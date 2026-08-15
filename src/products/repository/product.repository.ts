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

  async findByToken(productToken: string): Promise<Product | null> {
    const row = await this.model.findOne({ where: { productToken } });
    return row === null ? null : toProduct(row);
  }

  async findPage(page: number, size: number): Promise<{ items: Product[]; total: number }> {
    // The order is not decoration: without it MySQL may return rows in any
    // order and two pages could repeat or skip a product.
    const { rows, count } = await this.model.findAndCountAll({
      order: [['id', 'ASC']],
      offset: (page - 1) * size,
      limit: size,
    });
    return { items: rows.map(toProduct), total: count };
  }

  async deleteByToken(productToken: string): Promise<boolean> {
    const affected = await this.model.destroy({ where: { productToken } });
    return affected > 0;
  }
}
