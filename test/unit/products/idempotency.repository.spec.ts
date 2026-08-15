import { IdempotencyRepository } from '../../../src/products/repository/idempotency.repository';

function sequelizeMock(query: jest.Mock) {
  return { query } as unknown as import('sequelize').Sequelize;
}

describe('IdempotencyRepository', () => {
  it('restricts the lookup to the retention window', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new IdempotencyRepository(sequelizeMock(query));
    await repository.findFresh('key-12345678', 24, {} as never);

    const [sql, options] = query.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(sql).toContain('INTERVAL :hours HOUR');
    expect(options.replacements).toMatchObject({ key: 'key-12345678', hours: 24 });
  });

  it('reports false when the product does not exist', async () => {
    const query = jest.fn().mockResolvedValue([undefined, 0]);
    const repository = new IdempotencyRepository(sequelizeMock(query));
    await expect(
      repository.insertPending('key-12345678', 'SKU-999999', 'hash', {} as never),
    ).resolves.toBe(false);
  });

  it('saves the response on the idempotency record', async () => {
    const query = jest.fn().mockResolvedValue([undefined, 1]);
    const repository = new IdempotencyRepository(sequelizeMock(query));
    await repository.saveResponse('key-12345678', 200, { stock: 7 }, {} as never);
    const [sql, options] = query.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(sql).toContain('UPDATE idempotency_keys');
    expect(options.replacements).toMatchObject({ key: 'key-12345678', status: 200 });
  });
});
