import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCoordinator } from '../src/coordinator.mjs';
import { HostJobBroker } from '../src/host-job-broker.mjs';

const token = 'test-token-with-at-least-thirty-two-characters';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('native runner claims and completes an authenticated coordinator job', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-host-runner-'));
  const broker = new HostJobBroker(token);
  const server = createCoordinator({
    root,
    jobBroker: broker,
    config: {
      port: 0,
      agents: {
        claude: {
          enabled: true,
          command: 'claude',
          workspace: root,
          adapter: 'claude'
        }
      }
    }
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const messageRequest = fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '@claude "Investigate only."' })
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const unauthorized = await fetch(`${baseUrl}/internal/runner/jobs/claim`, {
      method: 'POST', body: '{}'
    });
    assert.equal(unauthorized.status, 401);

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const claim = await fetch(`${baseUrl}/internal/runner/jobs/claim`, {
      method: 'POST', headers, body: '{}'
    });
    const { job } = await claim.json();
    assert.equal(job.type, 'agent_run');
    assert.equal(job.payload.ownerMessage.text, 'Investigate only.');

    const complete = await fetch(
      `${baseUrl}/internal/runner/jobs/${job.id}/complete`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: { ok: true, output: 'Native runner response.' }
        })
      }
    );
    assert.equal(complete.status, 200);
    assert.equal((await messageRequest).status, 202);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    assert.equal(state.runs[0].status, 'SUCCEEDED');
    assert.equal(state.tasks[0].messages.at(-1).text, 'Native runner response.');
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});

test('runner token comparison rejects lookalikes and short tokens', () => {
  const broker = new HostJobBroker(token);
  assert.equal(broker.authorized(token), true);
  assert.equal(broker.authorized(`${token}x`), false);
  assert.equal(broker.authorized('short'), false);
  assert.throws(() => new HostJobBroker('too-short'), /at least 32/);
});
