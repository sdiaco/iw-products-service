import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './setup/app.factory';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports ok when the database answers', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers an unknown route in problem+json', async () => {
    const response = await request(app.getHttpServer()).get('/nope');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
