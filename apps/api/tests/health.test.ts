import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';

const app = createApp('http://localhost:3000');
const request = supertest(app);

describe('Health Endpoint', () => {
  it('GET /api/health should return 200 with correct shape', async () => {
    const res = await request.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('environment');
    // Timestamp should be valid ISO string
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('GET /api/health should return a valid timestamp', async () => {
    const before = new Date().toISOString();
    const res = await request.get('/api/health');
    const after = new Date().toISOString();

    expect(res.body.timestamp >= before).toBe(true);
    expect(res.body.timestamp <= after).toBe(true);
  });
});

describe('Error Handling', () => {
  it('should return 404 with consistent error format for unknown routes', async () => {
    const res = await request.get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('requestId');
    expect(typeof res.body.error.requestId).toBe('string');
  });

  it('should return 404 for root path /', async () => {
    const res = await request.get('/');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should include request ID in error responses', async () => {
    const customRequestId = 'test-request-123';
    const res = await request
      .get('/api/nonexistent')
      .set('X-Request-ID', customRequestId);

    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBe(customRequestId);
  });
});

describe('CORS', () => {
  it('should include CORS headers for allowed origin', async () => {
    const res = await request
      .get('/api/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
