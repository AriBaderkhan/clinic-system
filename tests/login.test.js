import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../main.js';

// These two cases need NO seeded data — they exist mainly to prove the whole
// test setup works (Vitest runs, Supertest reaches the app, the test DB connects).
describe('POST /login', () => {
  it('rejects an empty body with 400 (validation)', async () => {
    const res = await request(app).post('/login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects wrong credentials with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'ghost@nowhere.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
