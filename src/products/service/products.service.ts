import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../database/transaction.runner';
import type { NewProduct, Page, Product } from '../product';
import { STOCK_LOCK_WAIT_SECONDS } from '../products.constants';
import {
  InsufficientStockError,
  ProductNotFoundError,
  StockLimitExceededError,
} from '../products.errors';
import { ProductRepository } from '../repository/product.repository';

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly transactions: TransactionRunner,
  ) {}

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

  async remove(productToken: string): Promise<void> {
    const deleted = await this.products.deleteByToken(productToken);
    if (!deleted) {
      throw new ProductNotFoundError(productToken);
    }
  }

  async changeStock(productToken: string, delta: number): Promise<Product> {
    return this.transactions.run(async (transaction) => {
      await this.products.setLockWaitTimeout(transaction, STOCK_LOCK_WAIT_SECONDS);

      const affected = await this.products.applyStockDelta(productToken, delta, transaction);
      if (affected === 0) {
        const stock = await this.products.findStockForUpdate(productToken, transaction);
        if (stock === null) {
          throw new ProductNotFoundError(productToken);
        }
        throw delta < 0 ? new InsufficientStockError(stock) : new StockLimitExceededError();
      }

      const product = await this.products.findByToken(productToken, transaction);
      if (product === null) {
        throw new ProductNotFoundError(productToken);
      }
      return product;
    });
  }
}
