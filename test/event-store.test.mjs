import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EventStore } from '../src/event-store.mjs';
import { createEvent, createMessage } from '../src/state.mjs';

test('event store rebuilds state from an append-only log', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-store-'));

  try {
    const store = new EventStore(root);
    store.append(createEvent('MESSAGE_ADDED', {
      taskId: 'vton-quality',
      message: createMessage('owner', 'message', 'Investigate the regression.')
    }));

    const reopenedStore = new EventStore(root);
    const task = reopenedStore.readState().tasks[0];

    assert.equal(task.messages.length, 1);
    assert.equal(task.messages[0].text, 'Investigate the regression.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approval state is reconstructed without mutating previous events', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-approval-'));

  try {
    const store = new EventStore(root);
    store.append(createEvent('TASK_STATUS_SET', {
      taskId: 'vton-quality',
      status: 'OWNER_APPROVED',
      approvedScope: 'Implement parser tests only.'
    }));

    const task = store.readState().tasks[0];
    assert.equal(task.status, 'OWNER_APPROVED');
    assert.equal(task.approvedScope, 'Implement parser tests only.');
    assert.equal(store.readEvents().length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy state is migrated without losing task history', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-migration-'));
  const dataDirectory = join(root, 'data');
  mkdirSync(dataDirectory, { recursive: true });
  writeFileSync(join(dataDirectory, 'state.json'), JSON.stringify({
    tasks: [{
      id: 'legacy-task',
      name: 'Legacy task',
      status: 'OWNER_REVIEW',
      approvedScope: '',
      messages: [createMessage('owner', 'message', 'Preserve this message.')]
    }]
  }));

  try {
    const store = new EventStore(root);
    const task = store.readState().tasks.find(
      (candidate) => candidate.id === 'legacy-task'
    );

    assert.equal(task.messages[0].text, 'Preserve this message.');
    assert.equal(exists(join(dataDirectory, 'state.json.migrated')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function exists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
