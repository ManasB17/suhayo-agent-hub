import { randomUUID } from 'node:crypto';
import { createEvent, createMessage } from './state.mjs';

const terminalStatuses = new Set([
  'CANCELLED',
  'FAILED',
  'SUCCEEDED',
  'TIMED_OUT'
]);

function findRun(store, runId) {
  return store.readState().runs.find((run) => run.id === runId);
}

export class RunManager {
  constructor({ store, runner, timeoutMs = 10 * 60 * 1000 }) {
    this.store = store;
    this.runner = runner;
    this.timeoutMs = timeoutMs;
    this.memberQueues = new Map();
    this.controllers = new Map();
  }

  start({ memberName, configuration, task, message }) {
    const run = {
      id: randomUUID(),
      assignmentId: message.assignmentId,
      taskId: task.id,
      memberName,
      instruction: message.text,
      status: 'QUEUED',
      createdAt: new Date().toISOString()
    };
    this.store.append(createEvent('RUN_CREATED', { run }));

    const previous = this.memberQueues.get(memberName) ?? Promise.resolve();
    const execution = previous
      .catch(() => undefined)
      .then(() => this.execute(run, configuration, task, message));
    this.memberQueues.set(memberName, execution);
    execution.finally(() => {
      if (this.memberQueues.get(memberName) === execution) {
        this.memberQueues.delete(memberName);
      }
    });
    return run;
  }

  cancel(runId) {
    const run = findRun(this.store, runId);
    if (!run) throw new Error('Run not found.');
    if (terminalStatuses.has(run.status)) return run;

    this.store.append(createEvent('RUN_STATUS_SET', {
      runId,
      status: 'CANCELLED',
      finishedAt: new Date().toISOString()
    }));
    this.controllers.get(runId)?.abort();
    return findRun(this.store, runId);
  }

  async execute(run, configuration, task, message) {
    if (findRun(this.store, run.id)?.status === 'CANCELLED') return;

    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    this.store.append(createEvent('RUN_STATUS_SET', {
      runId: run.id,
      status: 'RUNNING',
      startedAt: new Date().toISOString()
    }));
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const result = await this.runner(
        run.memberName,
        configuration,
        task,
        message,
        { signal: controller.signal }
      );
      const current = findRun(this.store, run.id);
      if (current?.status === 'CANCELLED') return;

      const status = timedOut ? 'TIMED_OUT' : result.ok ? 'SUCCEEDED' : 'FAILED';
      const output = timedOut
        ? `@${run.memberName} exceeded the local run time limit.`
        : result.output;
      this.store.appendMany([
        createEvent('MESSAGE_ADDED', {
          taskId: run.taskId,
          message: createMessage(
            run.memberName,
            result.ok && !timedOut ? 'response' : 'error',
            output,
            { assignmentId: run.assignmentId, runId: run.id }
          )
        }),
        createEvent('RUN_STATUS_SET', {
          runId: run.id,
          status,
          finishedAt: new Date().toISOString()
        })
      ]);
    } catch (error) {
      if (findRun(this.store, run.id)?.status === 'CANCELLED') return;
      const status = timedOut ? 'TIMED_OUT' : 'FAILED';
      this.store.appendMany([
        createEvent('MESSAGE_ADDED', {
          taskId: run.taskId,
          message: createMessage(
            run.memberName,
            'error',
            timedOut
              ? `@${run.memberName} exceeded the local run time limit.`
              : `@${run.memberName} failed: ${error.message}`,
            { assignmentId: run.assignmentId, runId: run.id }
          )
        }),
        createEvent('RUN_STATUS_SET', {
          runId: run.id,
          status,
          finishedAt: new Date().toISOString()
        })
      ]);
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(run.id);
    }
  }
}
