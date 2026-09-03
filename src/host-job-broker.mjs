import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function generateRunnerToken() {
  return randomBytes(32).toString('hex');
}

export class HostJobBroker {
  constructor(token) {
    if (!token || token.length < 32) {
      throw new Error('Host runner token must contain at least 32 characters.');
    }
    this.token = token;
    this.jobs = [];
    this.pending = new Map();
  }

  authorized(candidate = '') {
    const expected = Buffer.from(this.token);
    const actual = Buffer.from(candidate);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  submit(type, payload, options = {}) {
    const job = {
      id: randomUUID(),
      type,
      payload,
      status: 'queued',
      createdAt: new Date().toISOString()
    };
    this.jobs.push(job);

    return new Promise((resolve, reject) => {
      const abort = () => {
        job.status = 'cancelled';
        this.pending.delete(job.id);
        reject(new Error('Host runner job cancelled.'));
      };
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(job.id, {
        resolve: (result) => {
          options.signal?.removeEventListener('abort', abort);
          resolve(result);
        },
        reject
      });
    });
  }

  claim() {
    const job = this.jobs.find((candidate) => candidate.status === 'queued');
    if (!job) return null;
    job.status = 'running';
    job.claimedAt = new Date().toISOString();
    return structuredClone(job);
  }

  complete(jobId, result) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    const pending = this.pending.get(jobId);
    if (!job || !pending || job.status === 'cancelled') return false;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    this.pending.delete(jobId);
    pending.resolve(result);
    return true;
  }

  publicStatus() {
    const queued = this.jobs.filter((job) => job.status === 'queued').length;
    const running = this.jobs.filter((job) => job.status === 'running').length;
    return { mode: 'native-host-runner', queued, running };
  }
}

export function createRemoteRunner(broker) {
  return (name, agent, task, ownerMessage, options = {}) => broker.submit(
    'agent_run',
    {
      name,
      agent,
      task,
      ownerMessage,
      sessionId: options.sessionId
    },
    { signal: options.signal }
  );
}

export class RemoteAuthenticationService {
  constructor(broker) {
    this.broker = broker;
  }

  check(member) {
    return this.broker.submit('auth_check', { member });
  }

  login(member, method) {
    return this.broker.submit('auth_login', { member, method });
  }
}
