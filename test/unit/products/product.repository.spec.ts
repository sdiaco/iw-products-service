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

describe('ProductRepository reads', () => {
  it('returns null when no product has that token', async () => {
    const model = modelMock({ findOne: jest.fn().mockResolvedValue(null) });
    const repository = new ProductRepository(model);
    await expect(repository.findByToken('SKU-000123')).resolves.toBeNull();
  });

  it('derives the offset from the page and orders by id', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [row], count: 42 });
    const repository = new ProductRepository(modelMock({ findAndCountAll }));
    const page = await repository.findPage(3, 20);
    expect(findAndCountAll).toHaveBeenCalledWith({
      order: [['id', 'ASC']],
      offset: 40,
      limit: 20,
    });
    expect(page.total).toBe(42);
  });
});

describe('ProductRepository.deleteByToken', () => {
  it('reports false when nothing was deleted', async () => {
    const repository = new ProductRepository(
      modelMock({ destroy: jest.fn().mockResolvedValue(0) }),
    );
    await expect(repository.deleteByToken('SKU-000123')).resolves.toBe(false);
  });
});
