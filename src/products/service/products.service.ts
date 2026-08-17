import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../database/transaction.runner';
import type { NewProduct, Page, Product } from '../product';
import { IDEMPOTENCY_RETENTION_HOURS, STOCK_LOCK_WAIT_SECONDS } from '../products.constants';
import {
  IdempotencyKeyReuseError,
  IdempotencyRequestInProgressError,
  InsufficientStockError,
  ProductNotFoundError,
  StockLimitExceededError,
} from '../products.errors';
import { IdempotencyRepository } from '../repository/idempotency.repository';
import { ProductRepository } from '../repository/product.repository';

export function hashStockRequest(productToken: string, delta: number): string {
  return createHash('sha256')
    .update(`PATCH /products/${productToken}/stock {"delta":${String(delta)}}`)
    .digest('hex');
}

function toStored(product: Product): Record<string, unknown> {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function fromStored(raw: unknown): Product {
  const stored = raw as Record<string, string | number>;
  return {
    productToken: String(stored.productToken),
    name: String(stored.name),
    price: String(stored.price),
    stock: Number(stored.stock),
    createdAt: new Date(String(stored.createdAt)),
    updatedAt: new Date(String(stored.updatedAt)),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly transactions: TransactionRunner,
    private readonly keys: IdempotencyRepository,
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

  async changeStock(productToken: string, delta: number, idempotencyKey: string): Promise<Product> {
    const requestHash = hashStockRequest(productToken, delta);

    return this.transactions.run(async (transaction) => {
      await this.products.setLockWaitTimeout(transaction, STOCK_LOCK_WAIT_SECONDS);

      const existing = await this.keys.findFresh(
        idempotencyKey,
        IDEMPOTENCY_RETENTION_HOURS,
        transaction,
      );
      if (existing !== null) {
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyKeyReuseError();
        }
        if (existing.responseStatus === null) {
          throw new IdempotencyRequestInProgressError();
        }
        return fromStored(existing.responseBody);
      }

      const attached = await this.keys.insertPending(
        idempotencyKey,
        productToken,
        requestHash,
        transaction,
      );
      if (!attached) {
        throw new ProductNotFoundError(productToken);
      }

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

      await this.keys.saveResponse(idempotencyKey, 200, toStored(product), transaction);
      return product;
    });
  }
}
