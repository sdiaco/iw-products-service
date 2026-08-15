import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

function productBody(index: number) {
  return {
    productToken: `SKU-${String(index).padStart(6, '0')}`,
    name: `Product ${String(index)}`,
    price: '10.00',
    stock: 5,
  };
}

describe('GET /products', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app.get<Sequelize>(SEQUELIZE));
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns one product', async () => {
    await request(app.getHttpServer()).post('/products').send(productBody(1));
    const response = await request(app.getHttpServer()).get('/products/SKU-000001');
    expect(response.status).toBe(200);
    const body = response.body as { data: { productToken: string } };
    expect(body.data.productToken).toBe('SKU-000001');
  });

  it('answers 404 for a token that does not exist', async () => {
    const response = await request(app.getHttpServer()).get('/products/SKU-999999');
    expect(response.status).toBe(404);
    const body = response.body as { code: string };
    expect(body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('answers 400 for a malformed token', async () => {
    const response = await request(app.getHttpServer()).get('/products/short');
    expect(response.status).toBe(400);
  });

  it('covers every product exactly once across two pages', async () => {
    for (let index = 1; index <= 5; index += 1) {
      await request(app.getHttpServer()).post('/products').send(productBody(index));
    }
    const first = await request(app.getHttpServer()).get('/products?page=1&size=3');
    const second = await request(app.getHttpServer()).get('/products?page=2&size=3');

    const firstBody = first.body as {
      data: { productToken: string }[];
      meta: Record<string, number>;
    };
    expect(firstBody.meta).toEqual({ page: 1, size: 3, total: 5, totalPages: 2 });
    const secondBody = second.body as { data: { productToken: string }[] };
    const tokens = [...firstBody.data, ...secondBody.data].map((item) => item.productToken);
    expect(new Set(tokens).size).toBe(5);
  });

  it('returns an empty page past the last one', async () => {
    const response = await request(app.getHttpServer()).get('/products?page=99&size=20');
    expect(response.status).toBe(200);
    const body = response.body as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it('rejects a page size above the maximum', async () => {
    const response = await request(app.getHttpServer()).get('/products?size=500');
    expect(response.status).toBe(400);
  });
});
