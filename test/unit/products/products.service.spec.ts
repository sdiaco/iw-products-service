import { ProductsService } from '../../../src/products/service/products.service';
import type { ProductRepository } from '../../../src/products/repository/product.repository';
import { ProductNotFoundError } from '../../../src/products/products.errors';

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

describe('ProductsService.create', () => {
  it('passes the input through and returns the stored product', async () => {
    const repository = repositoryMock();
    const service = new ProductsService(repository);
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
    );
    await expect(service.get('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('computes totalPages as a ceiling division', async () => {
    const findPage = jest.fn().mockResolvedValue({ items: [product], total: 41 });
    const service = new ProductsService(repositoryMock({ findPage }));
    const page = await service.list(1, 20);
    expect(page.meta).toEqual({ page: 1, size: 20, total: 41, totalPages: 3 });
  });
});

describe('ProductsService.remove', () => {
  it('raises ProductNotFound when nothing was deleted', async () => {
    const service = new ProductsService(
      repositoryMock({ deleteByToken: jest.fn().mockResolvedValue(false) }),
    );
    await expect(service.remove('SKU-000123')).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
