import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import type { DataResponse, ProductResponse } from '../../src/products/controller/product.response';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

interface ProblemDetail {
  readonly code: string;
  readonly status: number;
}

const body = {
  productToken: 'SKU-000123',
  name: 'Blue cotton shirt',
  price: '19.99',
  stock: 10,
};

describe('POST /products', () => {
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

  it('creates a product and points at it with Location', async () => {
    const response = await request(app.getHttpServer()).post('/products').send(body);
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/products/SKU-000123');
    const responseBody = response.body as DataResponse<ProductResponse>;
    expect(responseBody.data).toMatchObject({
      productToken: 'SKU-000123',
      price: '19.99',
      stock: 10,
    });
    expect(responseBody.data).not.toHaveProperty('id');
  });

  it('rejects a duplicate token with 409', async () => {
    await request(app.getHttpServer()).post('/products').send(body);
    const response = await request(app.getHttpServer()).post('/products').send(body);
    expect(response.status).toBe(409);
    expect((response.body as ProblemDetail).code).toBe('PRODUCT_TOKEN_ALREADY_EXISTS');
  });

  it('rejects a price with three decimals', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, price: '19.999' });
    expect(response.status).toBe(400);
    expect((response.body as ProblemDetail).code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unknown field', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, discount: 5 });
    expect(response.status).toBe(400);
    expect((response.body as ProblemDetail).code).toBe('VALIDATION_FAILED');
  });

  it('rejects a name made only of whitespace', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, name: '   ' });
    expect(response.status).toBe(400);
  });

  it('answers malformed JSON in problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Content-Type', 'application/json')
      .send('{"productToken":');
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('accepts a token of exactly 8 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: 'ABCD1234' });
    expect(response.status).toBe(201);
  });

  it('accepts a token of exactly 64 characters', async () => {
    const token = 'A'.repeat(64);
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: token });
    expect(response.status).toBe(201);
  });

  it('rejects a token shorter than 8 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: 'ABC1234' });
    expect(response.status).toBe(400);
  });

  it('rejects a token longer than 64 characters', async () => {
    const token = 'A'.repeat(65);
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: token });
    expect(response.status).toBe(400);
  });

  it('accepts price as a JSON number', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: 'NUM-PRICE', price: 19.99 });
    expect(response.status).toBe(201);
    expect((response.body as { data: { price: string } }).data.price).toBe('19.99');
  });

  it('accepts stock of zero', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: 'ZERO-STCK', stock: 0 });
    expect(response.status).toBe(201);
    expect((response.body as { data: { stock: number } }).data.stock).toBe(0);
  });

  it('accepts a zero price (free product)', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .send({ ...body, productToken: 'FREE-PROD', price: '0.00' });
    expect(response.status).toBe(201);
    expect((response.body as { data: { price: string } }).data.price).toBe('0.00');
  });
});
