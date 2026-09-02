import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AuthenticationService } from '../src/auth-service.mjs';
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

test('invite and provider-native login use internal command details', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-auth-'));
  const calls = [];
  const authentication = new AuthenticationService(async (specification) => {
    calls.push(specification);
    if (specification.purpose === 'authentication_status') {
      return { ok: true, output: 'Logged in using ChatGPT' };
    }
    return { ok: true, output: 'secret-provider-output' };
  });
  const server = createCoordinator({
    root,
    config: { port: 0, agents: {} },
    authentication
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const invite = await fetch(`${baseUrl}/api/members/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'reviewer',
        adapterId: 'codex',
        role: 'adversarial reviewer',
        workspace: root
      })
    });
    assert.equal(invite.status, 201);

    const login = await fetch(`${baseUrl}/api/members/reviewer/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'device' })
    });
    assert.equal(login.status, 200);
    assert.deepEqual(calls[0].arguments, ['login', '--device-auth']);

    const check = await fetch(`${baseUrl}/api/members/reviewer/auth/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(check.status, 200);
    assert.deepEqual(await check.json(), {
      status: 'connected',
      message: 'Provider authentication status checked.'
    });

    const members = await (await fetch(`${baseUrl}/api/members`)).json();
    assert.equal(members.members[0].authStatus, 'connected');
    assert.equal('command' in members.members[0], false);

    const persisted = readFileSync(join(root, 'data', 'events.jsonl'), 'utf8');
    assert.equal(persisted.includes('secret-provider-output'), false);
    assert.equal(persisted.includes('--device-auth'), false);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});

test('unauthenticated providers remain disabled and request login', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-login-required-'));
  const authentication = new AuthenticationService(async () => ({
    ok: false,
    output: 'credential-value-that-must-not-be-saved'
  }));
  const server = createCoordinator({
    root,
    config: { port: 0, agents: {} },
    authentication
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    await fetch(`${baseUrl}/api/members/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'claude-backup',
        adapterId: 'claude',
        workspace: root
      })
    });
    const response = await fetch(
      `${baseUrl}/api/members/claude-backup/auth/check`,
      { method: 'POST', body: '{}' }
    );
    assert.deepEqual(await response.json(), {
      status: 'login_required',
      message: 'Provider login is required.'
    });

    const members = await (await fetch(`${baseUrl}/api/members`)).json();
    assert.equal(members.members[0].enabled, false);
    assert.equal(members.members[0].authStatus, 'login_required');
    const persisted = readFileSync(join(root, 'data', 'events.jsonl'), 'utf8');
    assert.equal(persisted.includes('credential-value'), false);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});

test('authentication state becomes durable for legacy configured agents', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-legacy-auth-'));
  const authentication = new AuthenticationService(async () => ({
    ok: true,
    output: JSON.stringify({ loggedIn: true, credential: 'do-not-save' })
  }));
  const server = createCoordinator({
    root,
    config: {
      port: 0,
      agents: {
        claude: {
          enabled: true,
          command: 'claude',
          workspace: root
        }
      }
    },
    authentication
  });

  try {
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const response = await fetch(`${baseUrl}/api/members/claude/auth/check`, {
      method: 'POST',
      body: '{}'
    });
    assert.equal((await response.json()).status, 'connected');

    const persisted = readFileSync(join(root, 'data', 'events.jsonl'), 'utf8');
    assert.match(persisted, /MEMBER_AUTH_SET/);
    assert.equal(persisted.includes('do-not-save'), false);
    assert.equal(persisted.includes('"command"'), false);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
