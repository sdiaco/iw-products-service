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
  readonly available?: number;
}

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };

describe('PATCH /products/:productToken/stock', () => {
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

  it('applies a negative delta', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .set('Idempotency-Key', 'stock-test-key-0001')
      .send({ delta: -3 });
    expect(response.status).toBe(200);
    expect((response.body as DataResponse<StockData>).data.stock).toBe(7);
  });

  it('refuses to go below zero and leaves the row untouched', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .set('Idempotency-Key', 'stock-test-key-0002')
      .send({ delta: -11 });
    expect(response.status).toBe(409);
    expect((response.body as ProblemDetail).code).toBe('INSUFFICIENT_STOCK');
    expect((response.body as ProblemDetail).available).toBe(10);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect((after.body as DataResponse<StockData>).data.stock).toBe(10);
  });

  it('rejects a zero delta', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .set('Idempotency-Key', 'stock-test-key-0003')
      .send({ delta: 0 });
    expect(response.status).toBe(400);
  });

  it('rejects a delta sent as a string', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .set('Idempotency-Key', 'stock-test-key-0004')
      .send({ delta: '5' });
    expect(response.status).toBe(400);
  });

  it('answers 404 for a product that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-999999/stock')
      .set('Idempotency-Key', 'stock-test-key-0005')
      .send({ delta: -1 });
    expect(response.status).toBe(404);
  });

  it('applies a positive delta', async () => {
    const response = await request(app.getHttpServer())
      .patch('/products/SKU-000123/stock')
      .set('Idempotency-Key', 'positive-delta-001')
      .send({ delta: 5 });
    expect(response.status).toBe(200);
    expect((response.body as { data: { stock: number } }).data.stock).toBe(15);
  });
});
