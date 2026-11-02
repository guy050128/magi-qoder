import assert from 'node:assert/strict';
import test from 'node:test';
import { askOnce } from '../lib/qca.ts';

const units = ['MELCHIOR', 'BALTHASAR', 'CASPER'];
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('each submission waits for the previous acknowledgement while judgments overlap', async () => {
  const savedFetch = globalThis.fetch;
  const savedEnv = { QODER_PAT: process.env.QODER_PAT, QODER_API_ORIGIN: process.env.QODER_API_ORIGIN };
  const acknowledgements = Object.fromEntries(units.map(id => [id, deferred()]));
  const judgments = Object.fromEntries(units.map(id => [id, deferred()]));
  const created = [], submitted = [], polling = [], completed = [];
  const pending = [];
  process.env.QODER_PAT = 'test-only-no-network';
  process.env.QODER_API_ORIGIN = 'https://qca-test.invalid';
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/cloud/sessions' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      const id = body.agent.id;
      created.push(id);
      return Response.json({ id: `sess_${id}` });
    }
    const id = /\/sessions\/sess_([A-Z]+)/.exec(path)?.[1];
    assert.ok(units.includes(id), 'unexpected network request');
    if (path.endsWith('/events') && options.method === 'POST') {
      submitted.push({ id, topic: JSON.parse(options.body).events[0].content[0].text });
      await acknowledgements[id].promise;
      return Response.json({ data: [] });
    }
    if (path.endsWith('/events')) {
      polling.push(id);
      await judgments[id].promise;
      return Response.json({ data: [{ type: 'agent.message', content: [{ type: 'text', text: `actual ${id} result` }] }] });
    }
    return Response.json({ id: `sess_${id}`, status: 'idle', usage: { total_credits: 1 } });
  };
  try {
    for (const id of units) {
      const job = askOnce({ agentId: id, version: 1, environmentId: 'env_test', prompt: '同一个完整议题' });
      job.then(() => completed.push(id), () => {});
      pending.push(job);
    }
    await flush();
    assert.deepEqual(created, ['MELCHIOR']);
    assert.deepEqual(submitted.map(x => x.id), ['MELCHIOR']);
    acknowledgements.MELCHIOR.resolve();
    await flush();
    assert.deepEqual(created, ['MELCHIOR', 'BALTHASAR']);
    assert.ok(polling.includes('MELCHIOR'));
    assert.deepEqual(completed, [], 'later admission must not wait for a completed judgment');
    acknowledgements.BALTHASAR.resolve();
    await flush();
    assert.deepEqual(created, units);
    acknowledgements.CASPER.resolve();
    await flush();
    assert.deepEqual(polling, units);
    assert.deepEqual(submitted, units.map(id => ({ id, topic: '同一个完整议题' })));
    for (const id of ['CASPER', 'BALTHASAR', 'MELCHIOR']) {
      judgments[id].resolve();
      await flush();
    }
    const results = await Promise.all(pending);
    assert.deepEqual(completed, ['CASPER', 'BALTHASAR', 'MELCHIOR']);
    assert.deepEqual(results.map(x => x.reply.text), units.map(id => `actual ${id} result`));
  } finally {
    units.forEach(id => { acknowledgements[id].resolve(); judgments[id].resolve(); });
    await Promise.allSettled(pending);
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

for (const failureStage of ['create', 'send']) test(`a rejected ${failureStage} releases the admission queue for the next unit`, async () => {
  const savedFetch = globalThis.fetch;
  const savedEnv = { QODER_PAT: process.env.QODER_PAT, QODER_API_ORIGIN: process.env.QODER_API_ORIGIN };
  const calls = [];
  process.env.QODER_PAT = 'test-only-no-network';
  process.env.QODER_API_ORIGIN = 'https://qca-test.invalid';
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/cloud/sessions') {
      const id = JSON.parse(options.body).agent.id;
      calls.push(id);
      return id === 'MELCHIOR' && failureStage === 'create' ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ id: `sess_${id}` });
    }
    if (path.endsWith('/events')) {
      if (path.includes('sess_MELCHIOR/') && options.method === 'POST' && failureStage === 'send') return Response.json({ error: 'busy' }, { status: 409 });
      return Response.json(options.method === 'POST' ? { data: [] } : { data: [{ type: 'agent.message', content: [{ type: 'text', text: 'BALTHASAR result' }] }] });
    }
    return Response.json({ status: 'idle' });
  };
  try {
    const results = await Promise.allSettled(['MELCHIOR', 'BALTHASAR'].map(id => askOnce({ agentId: id, version: 1, environmentId: 'env_test', prompt: 'topic' })));
    assert.deepEqual(calls, ['MELCHIOR', 'BALTHASAR']);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(results[1].value.reply.text, 'BALTHASAR result');
  } finally {
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
