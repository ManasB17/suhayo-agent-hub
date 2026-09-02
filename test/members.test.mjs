import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCoordinator } from '../src/coordinator.mjs';

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

test('invited member is routable only after authentication and enablement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-member-'));
  const calls = [];
  const authentication = {
    check: async () => ({
      status: 'connected',
      message: 'Provider authentication status checked.'
    }),
    login: async () => {
      throw new Error('Login should not be needed.');
    }
  };
  const server = createCoordinator({
    root,
    config: { port: 0, agents: {} },
    authentication,
    runAgent: async (name, configuration, task, message) => {
      calls.push({ name, adapter: configuration.adapter, text: message.text });
      return { ok: true, output: 'Grok response', sessionId: 'grok-session' };
    }
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const jsonPost = (path, body = {}) => fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await jsonPost('/api/members/invite', {
      name: 'grok',
      adapterId: 'grok',
      role: 'backup investigator',
      workspace: root
    });

    let response = await jsonPost('/api/members/grok/enable');
    assert.equal(response.status, 409);
    await jsonPost('/api/members/grok/auth/check');
    response = await jsonPost('/api/members/grok/enable');
    assert.equal(response.status, 200);

    response = await jsonPost('/api/messages', {
      text: '@grok "Inspect only; do not edit."'
    });
    assert.equal(response.status, 202);
    assert.deepEqual(calls, [{
      name: 'grok',
      adapter: 'grok',
      text: 'Inspect only; do not edit.'
    }]);

    response = await jsonPost('/api/members/grok/disable');
    assert.equal(response.status, 200);
    const members = await (await fetch(`${baseUrl}/api/members`)).json();
    assert.equal(members.members[0].enabled, false);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
