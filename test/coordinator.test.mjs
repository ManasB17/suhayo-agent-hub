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

test('terminal and web API use one durable coordinator state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-coordinator-'));
  const server = createCoordinator({
    root,
    config: { port: 0, agents: {} }
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const messageResponse = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'A message from either client.' })
    });
    assert.equal(messageResponse.status, 202);

    const stateResponse = await fetch(`${baseUrl}/api/state`);
    const state = await stateResponse.json();
    const messages = state.tasks[0].messages;

    assert.equal(messages[0].text, 'A message from either client.');
    assert.equal(messages[1].author, 'system');
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});

test('coordinator records and clears owner approval', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-gate-'));
  const server = createCoordinator({
    root,
    config: { port: 0, agents: {} }
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    await fetch(`${baseUrl}/api/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'Implement the quoted parser.' })
    });

    let state = await (await fetch(`${baseUrl}/api/state`)).json();
    assert.equal(state.tasks[0].status, 'OWNER_APPROVED');

    await fetch(`${baseUrl}/api/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    state = await (await fetch(`${baseUrl}/api/state`)).json();
    assert.equal(state.tasks[0].status, 'OWNER_REVIEW');
    assert.equal(state.tasks[0].approvedScope, '');
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
