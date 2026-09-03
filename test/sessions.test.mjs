import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildAgentCommand,
  classifyAgentFailure,
  normalizeAgentOutput
} from '../src/agent-runner.mjs';
import { EventStore } from '../src/event-store.mjs';
import { RunManager } from '../src/run-manager.mjs';
import { createEvent } from '../src/state.mjs';
import { createCoordinator } from '../src/coordinator.mjs';

const task = {
  id: 'task',
  name: 'Task',
  status: 'OWNER_REVIEW',
  approvedScope: '',
  messages: []
};

const waitFor = async (condition) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Condition was not reached.');
};

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

test('provider command builders start and resume independent sessions', () => {
  const claude = { adapter: 'claude', command: 'claude', workspace: 'repo' };
  const codex = { adapter: 'codex', command: 'codex', workspace: 'repo' };
  const grok = { adapter: 'grok', command: 'grok', workspace: 'repo' };

  assert.deepEqual(
    buildAgentCommand('claude', claude, task, 'prompt', 'claude-session').arguments,
    ['-p', '--output-format', 'json', '--permission-mode', 'plan',
      '--resume', 'claude-session', 'prompt']
  );
  assert.deepEqual(
    buildAgentCommand('codex', codex, task, 'prompt', 'codex-session').arguments,
    ['exec', 'resume', '-c', 'approval_policy="never"', '-c',
      'sandbox_mode="read-only"', '--json', 'codex-session', 'prompt']
  );
  const grokArguments = buildAgentCommand(
    'grok', grok, task, '/skill inspect', 'grok-session'
  ).arguments;
  assert.deepEqual(grokArguments.slice(-4), [
    '--resume', 'grok-session', '--single', '/skill inspect'
  ]);
});

test('capacity failures are distinguished from authentication failures', () => {
  assert.equal(
    classifyAgentFailure('Maximum context window reached.'),
    'capacity_exhausted'
  );
  assert.equal(
    classifyAgentFailure('Not signed in. Authentication required.'),
    'authentication_required'
  );
});

test('provider output is normalized to assistant text and session id', () => {
  assert.deepEqual(normalizeAgentOutput('claude', JSON.stringify({
    type: 'result',
    result: 'Claude response',
    session_id: 'claude-session'
  })), {
    output: 'Claude response',
    sessionId: 'claude-session'
  });

  const codexOutput = [
    JSON.stringify({ type: 'thread.started', thread_id: 'codex-session' }),
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Codex response' }
    })
  ].join('\n');
  assert.deepEqual(normalizeAgentOutput('codex', codexOutput), {
    output: 'Codex response',
    sessionId: 'codex-session'
  });

  const grokError = [
    JSON.stringify({ type: 'error', message: 'Not signed in.' }),
    '\u001b[33mWARN\u001b[0m credential path unavailable'
  ].join('\n');
  assert.deepEqual(normalizeAgentOutput('grok', grokError), {
    output: 'Not signed in.',
    sessionId: undefined
  });
});

test('a member resumes its durable session while another starts independently', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-sessions-'));
  const store = new EventStore(root);
  const receivedSessions = [];
  let nextSession = 1;
  const manager = new RunManager({
    store,
    runner: async (name, agent, currentTask, message, options) => {
      receivedSessions.push({ name, sessionId: options.sessionId });
      return {
        ok: true,
        output: 'ok',
        sessionId: options.sessionId ?? `${name}-session-${nextSession++}`
      };
    }
  });
  const start = (name, text) => manager.start({
    memberName: name,
    configuration: { workspace: root },
    task: store.readState().tasks[0],
    message: { assignmentId: text, text }
  });

  try {
    start('claude', 'first');
    await waitFor(() => store.readState().runs[0]?.status === 'SUCCEEDED');
    start('claude', 'second');
    start('codex', 'independent');
    await waitFor(() => store.readState().runs.length === 3
      && store.readState().runs.every((run) => run.status === 'SUCCEEDED'));

    assert.deepEqual(receivedSessions, [
      { name: 'claude', sessionId: undefined },
      { name: 'claude', sessionId: 'claude-session-1' },
      { name: 'codex', sessionId: undefined }
    ]);
    assert.equal(store.readState().sessions.claude.id, 'claude-session-1');
    assert.equal(store.readState().sessions.codex.id, 'codex-session-2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('owner can clear a stale provider session', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-session-reset-'));
  const store = new EventStore(root);
  store.append(createEvent('SESSION_SET', {
    memberName: 'claude',
    sessionId: 'stale-session',
    updatedAt: new Date().toISOString()
  }));
  const server = createCoordinator({
    root,
    store,
    config: {
      port: 0,
      agents: {
        claude: {
          enabled: true,
          command: 'claude',
          workspace: root
        }
      }
    }
  });

  try {
    const port = await listen(server);
    const response = await fetch(
      `http://127.0.0.1:${port}/api/members/claude/session/reset`,
      { method: 'POST', body: '{}' }
    );
    assert.equal(response.status, 200);
    assert.equal(store.readState().sessions.claude, undefined);
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
