import { test } from 'node:test';
import assert from 'node:assert';

test('POST /api/auth/login rejects missing creds with 400', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://invalid';
  process.env.JWT_SECRET = 'test-secret';
  const { app } = await import('../src/server.js');
  const { createServer } = await import('node:http');
  const srv = createServer(app).listen(0);
  const { port } = srv.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 400);
  srv.close();
});
