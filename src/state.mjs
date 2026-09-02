import { randomUUID } from 'node:crypto';

export const defaultTask = Object.freeze({
  id: 'vton-quality',
  name: 'VTON quality investigation',
  status: 'OWNER_REVIEW',
  approvedScope: '',
  messages: []
});

export function initialState() {
  return {
    activeTaskId: defaultTask.id,
    tasks: [{ ...defaultTask, messages: [] }]
  };
}

function findTask(state, taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

export function reduceEvent(state, event) {
  const nextState = structuredClone(state);

  if (event.type === 'TASK_CREATED') {
    if (!findTask(nextState, event.task.id)) {
      nextState.tasks.push({ ...event.task, messages: [] });
    }
    nextState.activeTaskId = event.task.id;
  }

  if (event.type === 'MESSAGE_ADDED') {
    findTask(nextState, event.taskId)?.messages.push(event.message);
  }

  if (event.type === 'TASK_STATUS_SET') {
    const task = findTask(nextState, event.taskId);
    if (task) {
      task.status = event.status;
      task.approvedScope = event.approvedScope ?? '';
    }
  }

  return nextState;
}

export function createEvent(type, properties = {}) {
  return {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    ...properties
  };
}

export function createMessage(author, type, text, properties = {}) {
  return {
    id: randomUUID(),
    author,
    type,
    text,
    at: new Date().toISOString(),
    ...properties
  };
}
