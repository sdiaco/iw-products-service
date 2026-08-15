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

describe('concurrent stock decrements', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
    // Bind the HTTP server to a port once so the 20 parallel requests below all
    // reuse the same address. supertest lazily calls server.listen(0) on the
    // first request if the server is not already bound — then closes it after
    // the request completes. Subsequent simultaneous requests would all race to
    // call listen() on the now-unbound server and receive ECONNRESET.
    await app.listen(0);
  });
  beforeEach(async () => {
    await resetDatabase(app.get<Sequelize>(SEQUELIZE));
  });
  afterAll(async () => {
    await app.close();
  });

  it('lets exactly ten of twenty requests take the last ten units', async () => {
    await request(app.getHttpServer()).post('/products').send({
      productToken: 'SKU-000123',
      name: 'Blue cotton shirt',
      price: '19.99',
      stock: 10,
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer()).patch('/products/SKU-000123/stock').send({ delta: -1 }),
      ),
    );

    const applied = responses.filter((response) => response.status === 200).length;
    const rejected = responses.filter((response) => response.status === 409).length;
    expect(applied).toBe(10);
    expect(rejected).toBe(10);

    const after = await request(app.getHttpServer()).get('/products/SKU-000123');
    expect((after.body as DataResponse<StockData>).data.stock).toBe(0);
  });
});
