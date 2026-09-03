import { AuthenticationService } from './src/auth-service.mjs';
import { runAgent } from './src/agent-runner.mjs';

const coordinatorUrl = process.env.AGENT_HUB_URL ?? 'http://127.0.0.1:4317';
const token = process.env.AGENT_HUB_RUNNER_TOKEN;
if (!token) throw new Error('AGENT_HUB_RUNNER_TOKEN is required.');

const authentication = new AuthenticationService();
const maximumConcurrency = Number(process.env.AGENT_HUB_RUNNER_CONCURRENCY ?? 4);
const activeJobs = new Set();
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

async function runnerRequest(path, options = {}) {
  const response = await fetch(`${coordinatorUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`Coordinator returned ${response.status}.`);
  return response.json();
}

async function execute(job) {
  if (job.type === 'agent_run') {
    const { name, agent, task, ownerMessage, sessionId } = job.payload;
    return runAgent(name, agent, task, ownerMessage, { sessionId });
  }
  if (job.type === 'auth_check') {
    return authentication.check(job.payload.member);
  }
  if (job.type === 'auth_login') {
    return authentication.login(job.payload.member, job.payload.method);
  }
  throw new Error(`Unsupported host job: ${job.type}`);
}

console.log(`Native host runner connected to ${coordinatorUrl}`);
while (!stopping) {
  try {
    if (activeJobs.size >= maximumConcurrency) {
      await Promise.race(activeJobs);
      continue;
    }
    const { job } = await runnerRequest('/internal/runner/jobs/claim', {
      method: 'POST',
      body: '{}'
    });
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    const activeJob = (async () => {
      let result;
      try {
        result = await execute(job);
      } catch (error) {
        result = { ok: false, output: `Host runner failed: ${error.message}` };
      }
      await runnerRequest(`/internal/runner/jobs/${job.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ result })
      });
    })().catch((error) => console.error(error.message));
    activeJobs.add(activeJob);
    activeJob.finally(() => activeJobs.delete(activeJob));
  } catch (error) {
    console.error(error.message);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
await Promise.allSettled(activeJobs);
