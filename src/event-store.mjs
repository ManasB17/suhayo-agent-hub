import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createEvent,
  defaultTask,
  initialState,
  reduceEvent
} from './state.mjs';

export class EventStore {
  constructor(root) {
    this.eventsPath = join(root, 'data', 'events.jsonl');
    this.legacyPath = join(root, 'data', 'state.json');
    mkdirSync(dirname(this.eventsPath), { recursive: true });
    this.migrateLegacyState();
  }

  readEvents() {
    if (!existsSync(this.eventsPath)) return [];

    return readFileSync(this.eventsPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  readState() {
    return this.readEvents().reduce(reduceEvent, initialState());
  }

  append(event) {
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    return event;
  }

  appendMany(events) {
    if (!events.length) return;
    appendFileSync(
      this.eventsPath,
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      'utf8'
    );
  }

  migrateLegacyState() {
    if (existsSync(this.eventsPath) || !existsSync(this.legacyPath)) return;

    const legacyState = JSON.parse(readFileSync(this.legacyPath, 'utf8'));
    const events = [];

    for (const task of legacyState.tasks ?? []) {
      events.push(createEvent('TASK_CREATED', {
        task: {
          id: task.id,
          name: task.name,
          status: 'OWNER_REVIEW',
          approvedScope: ''
        }
      }));

      events.push(...(task.messages ?? []).map((message) =>
        createEvent('MESSAGE_ADDED', { taskId: task.id, message })
      ));

      events.push(createEvent('TASK_STATUS_SET', {
        taskId: task.id,
        status: task.status ?? 'OWNER_REVIEW',
        approvedScope: task.approvedScope ?? ''
      }));
    }

    if (!events.length) {
      events.push(createEvent('TASK_CREATED', { task: defaultTask }));
    }

    this.appendMany(events);
    renameSync(this.legacyPath, `${this.legacyPath}.migrated`);
  }
}
