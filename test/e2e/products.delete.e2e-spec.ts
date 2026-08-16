import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { SEQUELIZE } from '../../src/database/database.tokens';
import { createTestApp } from './setup/app.factory';
import { resetDatabase } from './setup/database';

const body = { productToken: 'SKU-000123', name: 'Blue cotton shirt', price: '19.99', stock: 10 };

describe('DELETE /products/:productToken', () => {
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

  it('deletes the product and then cannot find it', async () => {
    await request(app.getHttpServer()).post('/products').send(body);
    const deleted = await request(app.getHttpServer()).delete('/products/SKU-000123');
    expect(deleted.status).toBe(204);

    const missing = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect(missing.status).toBe(404);
  });

  it('answers 404 when the product is already gone', async () => {
    const response = await request(app.getHttpServer()).delete('/products/SKU-000123');
    expect(response.status).toBe(404);
    expect((response.body as { code: string }).code).toBe('PRODUCT_NOT_FOUND');
  });
});
