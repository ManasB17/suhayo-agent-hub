import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EventStore } from '../src/event-store.mjs';
import { RunManager } from '../src/run-manager.mjs';

const wait = (milliseconds) => new Promise(
  (resolve) => setTimeout(resolve, milliseconds)
);

function fixture(runner, timeoutMs = 500) {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-runs-'));
  const store = new EventStore(root);
  const manager = new RunManager({ store, runner, timeoutMs });
  const task = store.readState().tasks[0];
  const start = (text, memberName = 'claude') => manager.start({
    memberName,
    configuration: { workspace: root },
    task,
    message: { assignmentId: text, text }
  });
  return { root, store, manager, start };
}

test('runs move through durable queued, running, and succeeded states', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { root, store, start } = fixture(async () => {
    await gate;
    return { ok: true, output: 'Completed safely.' };
  });

  try {
    const run = start('inspect');
    await wait(10);
    assert.equal(store.readState().runs[0].status, 'RUNNING');
    release();
    await wait(10);
    const state = store.readState();
    assert.equal(state.runs[0].status, 'SUCCEEDED');
    assert.equal(state.tasks[0].messages[0].runId, run.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one member runs sequentially while different members run independently', async () => {
  const active = new Set();
  const observations = [];
  const { root, store, start } = fixture(async (name, agent, task, message) => {
    observations.push({ name, text: message.text, active: [...active] });
    active.add(name);
    await wait(20);
    active.delete(name);
    return { ok: true, output: 'ok' };
  });

  try {
    start('first', 'claude');
    start('second', 'claude');
    start('parallel', 'codex');
    await wait(70);
    assert.deepEqual(observations.map(({ name, text }) => ({ name, text })), [
      { name: 'claude', text: 'first' },
      { name: 'codex', text: 'parallel' },
      { name: 'claude', text: 'second' }
    ]);
    assert.deepEqual(observations[1].active, ['claude']);
    assert.equal(store.readState().runs.every(
      (run) => run.status === 'SUCCEEDED'
    ), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('running work can be cancelled without recording a late response', async () => {
  const { root, store, manager, start } = fixture(async (
    name, agent, task, message, options
  ) => new Promise((resolve) => {
    options.signal.addEventListener('abort', () => {
      resolve({ ok: false, output: 'late cancellation output' });
    });
  }));

  try {
    const run = start('cancel me');
    await wait(10);
    manager.cancel(run.id);
    await wait(10);
    const state = store.readState();
    assert.equal(state.runs[0].status, 'CANCELLED');
    assert.equal(state.tasks[0].messages.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run timeout aborts execution and records a bounded error', async () => {
  const { root, store, start } = fixture(async (
    name, agent, task, message, options
  ) => new Promise((resolve) => {
    options.signal.addEventListener('abort', () => {
      resolve({ ok: false, output: 'untrusted provider detail' });
    });
  }), 10);

  try {
    start('time out');
    await wait(30);
    const state = store.readState();
    assert.equal(state.runs[0].status, 'TIMED_OUT');
    assert.match(state.tasks[0].messages[0].text, /time limit/);
    assert.equal(state.tasks[0].messages[0].text.includes('untrusted'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
