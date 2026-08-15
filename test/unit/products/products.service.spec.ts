import { ProductsService } from '../../../src/products/service/products.service';
import type { ProductRepository } from '../../../src/products/repository/product.repository';
import {
  InsufficientStockError,
  ProductNotFoundError,
  StockLimitExceededError,
} from '../../../src/products/products.errors';
import type { TransactionRunner } from '../../../src/database/transaction.runner';

const product = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
  createdAt: new Date('2026-08-14T10:00:00.000Z'),
  updatedAt: new Date('2026-08-14T10:00:00.000Z'),
};

function repositoryMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn().mockResolvedValue(product),
    findByToken: jest.fn(),
    findPage: jest.fn(),
    deleteByToken: jest.fn(),
    ...overrides,
  } as unknown as ProductRepository;
}

const runner = {
  run: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
} as unknown as TransactionRunner;

function stockRepositoryMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return repositoryMock({
    setLockWaitTimeout: jest.fn().mockResolvedValue(undefined),
    applyStockDelta: jest.fn().mockResolvedValue(1),
    findStockForUpdate: jest.fn(),
    findByToken: jest.fn().mockResolvedValue({ ...product, stock: 7 }),
    ...overrides,
  });
}

describe('ProductsService.create', () => {
  it('passes the input through and returns the stored product', async () => {
    const repository = repositoryMock();
    const service = new ProductsService(repository, runner);
    const created = await service.create({
      productToken: 'SKU-000123',
      name: 'Blue cotton shirt',
      price: '19.99',
      stock: 10,
    });
    expect(created).toEqual(product);
    // Destructure to avoid @typescript-eslint/unbound-method on the mock assertion.
    const { create } = repository as unknown as { create: jest.Mock };
    expect(create).toHaveBeenCalledWith({
      productToken: 'SKU-000123',
      name: 'Blue cotton shirt',
      price: '19.99',
      stock: 10,
    });
  });
});

describe('ProductsService reads', () => {
  it('raises ProductNotFound when the repository has nothing', async () => {
    const service = new ProductsService(
      repositoryMock({ findByToken: jest.fn().mockResolvedValue(null) }),
      runner,
    );
    await expect(service.get('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('computes totalPages as a ceiling division', async () => {
    const findPage = jest.fn().mockResolvedValue({ items: [product], total: 41 });
    const service = new ProductsService(repositoryMock({ findPage }), runner);
    const page = await service.list(1, 20);
    expect(page.meta).toEqual({ page: 1, size: 20, total: 41, totalPages: 3 });
  });
});

describe('ProductsService.remove', () => {
  it('raises ProductNotFound when nothing was deleted', async () => {
    const service = new ProductsService(
      repositoryMock({ deleteByToken: jest.fn().mockResolvedValue(false) }),
      runner,
    );
    await expect(service.remove('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('ProductsService.changeStock', () => {
  it('returns the updated product when the guard passes', async () => {
    const service = new ProductsService(stockRepositoryMock(), runner);
    await expect(service.changeStock('SKU-000123', -3)).resolves.toMatchObject({ stock: 7 });
  });

  it('reports the available stock when the delta would go below zero', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(2),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', -3)).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
  });

  it('raises the limit error when a positive delta would overflow', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(2_147_483_646),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', 5)).rejects.toBeInstanceOf(
      StockLimitExceededError,
    );
  });

  it('raises ProductNotFound when the row is gone', async () => {
    const service = new ProductsService(
      stockRepositoryMock({
        applyStockDelta: jest.fn().mockResolvedValue(0),
        findStockForUpdate: jest.fn().mockResolvedValue(null),
      }),
      runner,
    );
    await expect(service.changeStock('SKU-000123', -1)).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});
