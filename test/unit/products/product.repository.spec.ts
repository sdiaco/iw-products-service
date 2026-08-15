import { UniqueConstraintError } from 'sequelize';
import { ProductRepository } from '../../../src/products/repository/product.repository';
import type { ProductModel } from '../../../src/products/repository/models/product.model';
import { ProductTokenAlreadyExistsError } from '../../../src/products/products.errors';

const row = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
  createdAt: new Date('2026-08-14T10:00:00.000Z'),
  updatedAt: new Date('2026-08-14T10:00:00.000Z'),
};

function modelMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn().mockResolvedValue(row),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  } as unknown as typeof ProductModel;
}

describe('ProductRepository.create', () => {
  it('returns the created product without its id', async () => {
    const repository = new ProductRepository(modelMock());
    const product = await repository.create({ ...row });
    expect(product).toEqual(row);
    expect(product).not.toHaveProperty('id');
  });

  it('translates a unique violation into a domain error', async () => {
    const model = modelMock({
      create: jest.fn().mockRejectedValue(new UniqueConstraintError({})),
    });
    const repository = new ProductRepository(model);
    await expect(repository.create({ ...row })).rejects.toBeInstanceOf(
      ProductTokenAlreadyExistsError,
    );
  });
});
