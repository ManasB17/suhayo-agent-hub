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
    members: [],
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

  if (event.type === 'MEMBER_INVITED') {
    const existingIndex = nextState.members.findIndex(
      (member) => member.name === event.member.name
    );
    if (existingIndex === -1) nextState.members.push(event.member);
    else nextState.members[existingIndex] = event.member;
  }

  if (event.type === 'MEMBER_AUTH_SET') {
    const member = nextState.members.find(
      (candidate) => candidate.name === event.name
    );
    if (member) {
      member.authStatus = event.status;
      member.authMessage = event.message;
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
