const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'https://shop.example';
const app = require('../server');

test('HTTP boundary rejects unsafe requests and reports database unavailability', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/ready`);
    assert.equal(response.status, 503);
    response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://shop.example' } });
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://shop.example');
    assert.equal(response.headers.get('x-powered-by'), null);
    response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://shop.example.attacker.com' } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    response = await fetch(`${base}/api/products/search/stream?q=phone&token=ignored`);
    assert.equal(response.status, 401);
    response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(response.status, 400);
    response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(1024 * 1024) }) });
    assert.equal(response.status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
