import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const bootstrap = fileURLToPath(new URL('./bootstrap-qca.mjs', import.meta.url));
const units = ['MELCHIOR', 'BALTHASAR', 'CASPER'];

function runSurvey(t, { environmentPresent = true, initialState } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'magi-bootstrap-survey-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const stateFile = path.join(cwd, '.magi-state.json');
  if (initialState !== undefined) fs.writeFileSync(stateFile, initialState);

  const fixture = {
    models: units.map(unit => ({ id: `model_${unit}`, enabled: true })),
    environments: environmentPresent ? [{
      id: 'env_test', type: 'environment', name: 'magi-environment',
      config: { type: 'cloud' }, metadata: { app: 'magi-system', role: 'magi-runtime' },
    }] : [],
    agents: units.map(unit => ({
      id: `agent_${unit}`, type: 'agent', name: `magi-${unit.toLowerCase()}`,
      model: { id: `model_${unit}` }, version: 1,
      metadata: { app: 'magi-system', unit },
    })),
  };
  // Replace the transport before the real script loads. There is no fallback
  // to the network, and any mutation or unexpected endpoint fails the child.
  const preload = `
    import assert from 'node:assert/strict';
    const fixture = ${JSON.stringify(fixture)};
    globalThis.fetch = async (url, options) => {
      const target = new URL(url);
      assert.equal(target.origin, 'https://qca-test.invalid');
      assert.equal(options.method, 'GET', 'survey must only make read requests');
      assert.equal(options.headers.Authorization, 'Bearer test-only-no-network');
      const resource = target.pathname.replace('/api/v1/cloud/', '');
      assert.ok(Object.hasOwn(fixture, resource), 'unexpected endpoint: ' + target.pathname);
      return Response.json({ data: fixture[resource], has_more: false });
    };
  `;
  const result = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(preload)}`, bootstrap,
  ], {
    cwd,
    env: {
      QODER_PAT: 'test-only-no-network',
      QODER_API_ORIGIN: 'https://qca-test.invalid',
    },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  return { ...result, stateFile };
}

test('survey preserves existing state when all three agents and the environment exist', t => {
  const sentinel = '{"sentinel":"keep this exact content"}\n';
  const result = runSurvey(t, { initialState: sentinel });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All three units resolve/);
  assert.equal(fs.readFileSync(result.stateFile, 'utf8'), sentinel, 'survey must not rewrite existing state');
});

test('survey exits cleanly without writing state when the environment is absent', t => {
  const result = runSurvey(t, { environmentPresent: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /environment\s+: ABSENT/);
  assert.match(result.stdout, /All three units resolve/);
  assert.equal(fs.existsSync(result.stateFile), false, 'survey must not create state');
});
