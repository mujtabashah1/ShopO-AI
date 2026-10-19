import { vi } from 'vitest';
import { createEventParser, openSearchStream } from './searchStream';
import api from './api';
vi.mock('./api', () => ({ default: { defaults: { baseURL: 'http://localhost:5000/api' } } }));

test('SSE parser handles split frames, heartbeats and CRLF', () => {
  const events = [];
  const parse = createEventParser((event, data) => events.push({ event, data }));
  parse(': heartbeat\n\nevent: platform_');
  parse('done\r\ndata: {"count":2}\r');
  parse('\n\r\nevent: cached\ndata: {"products":[]}\n\n');
  expect(events).toEqual([
    { event: 'platform_done', data: '{"count":2}' },
    { event: 'cached', data: '{"products":[]}' }
  ]);
});

test('stream uses configured API origin and keeps credentials out of URLs', async () => {
  api.defaults.baseURL = 'https://api.example/api/';
  localStorage.setItem('smartshop_token', 'secret');
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: 'Slow down' }) });
  const error = await new Promise(resolve => {
    const stream = openSearchStream(new URLSearchParams({ q: 'phone' }));
    stream.addEventListener('error', resolve);
  });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://api.example/api/products/search/stream?q=phone');
  expect(options.headers.Authorization).toBe('Bearer secret');
  expect(JSON.parse(error.data).message).toBe('Slow down');
});
