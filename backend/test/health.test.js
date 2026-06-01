import { test } from 'node:test';
import assert from 'node:assert';

test('GET /health returns ok shape when db up', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://invalid';
  process.env.JWT_SECRET = 'test-secret';
  const { app } = await import('../src/server.js');
  const { createServer } = await import('node:http');
  const srv = createServer(app).listen(0);
  const { port } = srv.address();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();
  assert.ok(['ok', 'degraded'].includes(body.status));
  assert.ok('db' in body && 'time' in body);
  srv.close();
});
