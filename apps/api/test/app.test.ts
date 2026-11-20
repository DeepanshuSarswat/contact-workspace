import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createTestPool } from './helpers/db';

const pool = createTestPool();
const app = createApp({ pool });

afterAll(() => pool.end());

describe('app skeleton', () => {
  it('GET /api/health returns ok, database status and a request id', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown routes return the standard error shape', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400 BAD_REQUEST, not 500', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('does not expose x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
