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
    const cleanup = () => {
      if (this.memberQueues.get(memberName) === execution) {
        this.memberQueues.delete(memberName);
      }
    };
    execution.then(cleanup, cleanup);
    return run;
  }

  async whenIdle(memberName) {
    if (memberName) {
      await (this.memberQueues.get(memberName) ?? Promise.resolve());
      return;
    }
    await Promise.all([...this.memberQueues.values()]);
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
        {
          signal: controller.signal,
          sessionId: this.store.readState().sessions[run.memberName]?.id
        }
      );
      const current = findRun(this.store, run.id);
      if (current?.status === 'CANCELLED') return;

      const status = timedOut ? 'TIMED_OUT' : result.ok ? 'SUCCEEDED' : 'FAILED';
      const output = timedOut
        ? `@${run.memberName} exceeded the local run time limit.`
        : result.output;
      const events = [
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
      ];
      if (result.sessionId) {
        events.push(createEvent('SESSION_SET', {
          memberName: run.memberName,
          sessionId: result.sessionId,
          updatedAt: new Date().toISOString()
        }));
      }
      this.store.appendMany(events);
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
