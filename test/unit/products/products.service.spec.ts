import { ProductsService } from '../../../src/products/service/products.service';
import type { ProductRepository } from '../../../src/products/repository/product.repository';

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
