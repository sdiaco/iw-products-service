import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, Sequelize, UniqueConstraintError, type Transaction } from 'sequelize';
import { PRODUCT_MODEL, SEQUELIZE } from '../../database/database.tokens';
import { ConcurrentModificationError } from '../../common/errors/infrastructure.errors';
import { INT_MAX } from '../products.constants';
import type { NewProduct, Product } from '../product';
import { ProductTokenAlreadyExistsError } from '../products.errors';
import { ProductModel, toProduct } from './models/product.model';

@Injectable()
export class ProductRepository {
  constructor(
    @Inject(PRODUCT_MODEL) private readonly model: typeof ProductModel,
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

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

  async findByToken(productToken: string, transaction?: Transaction): Promise<Product | null> {
    const row = await this.model.findOne({ where: { productToken }, transaction });
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

  async setLockWaitTimeout(transaction: Transaction, seconds: number): Promise<void> {
    await this.sequelize.query('SET SESSION innodb_lock_wait_timeout = :seconds', {
      replacements: { seconds },
      transaction,
    });
  }

  async applyStockDelta(
    productToken: string,
    delta: number,
    transaction: Transaction,
  ): Promise<number> {
    try {
      const [, affected] = await this.sequelize.query(
        `UPDATE products
            SET stock = stock + :delta, updatedAt = :now
          WHERE productToken = :productToken
            AND stock + :delta >= 0
            AND stock + :delta <= :intMax`,
        {
          replacements: { delta, now: new Date(), productToken, intMax: INT_MAX },
          transaction,
          type: QueryTypes.UPDATE,
        },
      );
      return affected;
    } catch (error) {
      if (isLockError(error)) {
        throw new ConcurrentModificationError();
      }
      throw error;
    }
  }

  async findStockForUpdate(productToken: string, transaction: Transaction): Promise<number | null> {
    const rows = await this.sequelize.query(
      'SELECT stock FROM products WHERE productToken = :productToken FOR UPDATE',
      { replacements: { productToken }, transaction, type: QueryTypes.SELECT },
    );
    return rows.length === 0 ? null : (rows[0] as { stock: number }).stock;
  }
}

const LOCK_ERROR_CODES: ReadonlySet<string> = new Set(['ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK']);

interface DriverError {
  readonly original?: { readonly code?: string };
}

function isLockError(error: unknown): boolean {
  const code = (error as DriverError).original?.code;
  return code !== undefined && LOCK_ERROR_CODES.has(code);
}
