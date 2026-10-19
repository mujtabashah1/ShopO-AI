const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkCapacity } = require('../middleware/workCapacity');

test('expensive work stays bounded until completion and releases slots on errors', async () => {
  const wrap = createWorkCapacity(1);
  let finish;
  const pending = wrap(() => new Promise(resolve => { finish = resolve; }))({}, {}, () => {});
  let status, retry, started = false;
  const res = { setHeader(key, value) { retry = value; }, status(value) { status = value; return this; }, json() {} };
  await wrap(async () => { started = true; })({}, res, () => {});
  assert.equal(status, 503);
  assert.equal(retry, '10');
  assert.equal(started, false);
  finish();
  await pending;
  let forwarded;
  await wrap(async () => { throw new Error('failed'); })({}, res, error => { forwarded = error; });
  assert.equal(forwarded.message, 'failed');
  await wrap(async () => { started = true; })({}, res, () => {});
  assert.equal(started, true);
});
