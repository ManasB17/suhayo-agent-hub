import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { loadConfig, projectRoot } from './src/config.mjs';
import { requestJson, waitForCoordinator } from './src/http-client.mjs';

const settings = loadConfig();
const baseUrl = `http://127.0.0.1:${settings.port}`;

async function ensureCoordinator() {
  try {
    await waitForCoordinator(baseUrl, 300);
    return;
  } catch {
    const child = spawn(process.execPath, ['web-server.mjs'], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    await waitForCoordinator(baseUrl);
  }
}

function activeTask(state) {
  return state.tasks.find((task) => task.id === state.activeTaskId)
    ?? state.tasks[0];
}

function printTask(state) {
  const task = activeTask(state);
  console.log(`\n${task.name}`);
  console.log(`State: ${task.status}`);
  if (task.approvedScope) console.log(`Approved scope: ${task.approvedScope}`);

  if (task.messages.length) {
    console.log('\nRecent handoff:');
    for (const message of task.messages.slice(-6)) {
      console.log(`\n[${message.author}] ${message.text}`);
    }
  }
}

function printHelp() {
  console.log(`
Agent Hub commands

  @claude <request>       Route work to Claude Code
  @codex <request>        Route work to Codex
  @both <request>         Route work to every enabled agent
  /status                 Show task state and recent handoff
  /approve <exact scope>  Record owner approval
  /hold                   Return the task to OWNER_REVIEW
  /agents                 List configured agents
  /exit                   Leave the terminal client
`);
}

async function handleInput(input) {
  if (input === '/help') {
    printHelp();
    return true;
  }

  if (input === '/status') {
    printTask(await requestJson(baseUrl, '/api/state'));
    return true;
  }

  if (input === '/agents') {
    const { agents } = await requestJson(baseUrl, '/api/agents');
    for (const agent of agents) {
      console.log(`@${agent.name}: ${agent.enabled ? 'enabled' : 'disabled'}`);
    }
    return true;
  }

  if (input === '/hold') {
    await requestJson(baseUrl, '/api/hold', { method: 'POST', body: '{}' });
    console.log('Task returned to OWNER_REVIEW.');
    return true;
  }

  if (input.startsWith('/approve ')) {
    const scope = input.slice('/approve '.length).trim();
    await requestJson(baseUrl, '/api/approve', {
      method: 'POST',
      body: JSON.stringify({ scope })
    });
    console.log('Owner approval recorded.');
    return true;
  }

  if (input === '/exit' || input === '/quit') return false;

  await requestJson(baseUrl, '/api/messages', {
    method: 'POST',
    body: JSON.stringify({ text: input })
  });
  console.log('Message recorded. Agent responses will appear in this shared room.');
  return true;
}

await ensureCoordinator();
console.log('Agent Hub local command center');
console.log('Type /help for commands.');

const terminal = createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const input = (await terminal.question('\nagent-hub> ')).trim();
  if (!input) continue;

  try {
    if (!(await handleInput(input))) break;
  } catch (error) {
    console.error(error.message);
  }
}
terminal.close();
