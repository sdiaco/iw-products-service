import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import type { DataResponse } from '../../src/products/controller/product.response';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

interface StockData {
  readonly stock: number;
}

interface ProblemDetail {
  readonly code: string;
}

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };
const key = 'idem-key-000001';

describe('idempotent stock changes', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app.get<Sequelize>(SEQUELIZE));
    await request(app.getHttpServer()).post('/products').send(body);
  });
  afterAll(async () => {
    await app.close();
  });

  const patch = (): request.Test =>
    request(app.getHttpServer()).patch('/products/SKU-000123/stock').set('Idempotency-Key', key);

  it('requires the header', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .send({ delta: -1 });
    expect(response.status).toBe(400);
  });

  it('replays the same response and applies the delta once', async () => {
    const first = await patch().send({ delta: -3 });
    const second = await patch().send({ delta: -3 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect((after.body as DataResponse<StockData>).data.stock).toBe(7);
  });

  it('rejects the same key with a different payload', async () => {
    await patch().send({ delta: -3 });
    const response = await patch().send({ delta: -4 });
    expect(response.status).toBe(409);
    expect((response.body as ProblemDetail).code).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  it('keeps nothing when the request fails, so a retry is executed', async () => {
    const failed = await patch().send({ delta: -99 });
    expect(failed.status).toBe(409);
    expect((failed.body as ProblemDetail).code).toBe('INSUFFICIENT_STOCK');

    const retried = await patch().send({ delta: -99 });
    expect((retried.body as ProblemDetail).code).toBe('INSUFFICIENT_STOCK');
  });

  it('removes the keys of a deleted product', async () => {
    await patch().send({ delta: -1 });
    await request(app.getHttpServer()).delete('/products/SKU-000123');

    const sequelize = app.get<Sequelize>(SEQUELIZE);
    const rows = await sequelize.query('SELECT COUNT(*) AS total FROM idempotency_keys');
    const total = (rows[0] as [{ total: string }])[0].total;
    expect(parseInt(total, 10)).toBe(0);
  });
});
