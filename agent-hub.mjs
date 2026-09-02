import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { loadConfig, projectRoot } from './src/config.mjs';
import { requestJson, waitForCoordinator } from './src/http-client.mjs';

const settings = loadConfig();
const port = Number(process.env.AGENT_HUB_PORT ?? settings.port);
const baseUrl = `http://127.0.0.1:${port}`;

async function ensureCoordinator() {
  try {
    await waitForCoordinator(baseUrl, 300);
    return;
  } catch {
    try {
      await requestJson(baseUrl, '/api/state');
      throw new Error(
        `An older Agent Hub is using port ${port}. Stop it or choose AGENT_HUB_PORT.`
      );
    } catch (error) {
      if (error.message.startsWith('An older Agent Hub')) throw error;
    }
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

  @claude "request"       Route work to one member
  @codex "one" @claude "another"
  /status                 Show task state and recent handoff
  /approve <exact scope>  Record owner approval
  /hold                   Return the task to OWNER_REVIEW
  /members                List room members
  /invite <name> <provider> <role> <workspace>
  /auth <name>            Check provider login
  /login <name> <method>  Start provider OAuth or device login
  /enable <name>          Allow mention routing to a connected member
  /disable <name>         Pause mention routing
  /runs                   List recent run states
  /cancel <run-id>        Cancel queued or running work
  /reset-session <name>   Start fresh on that member's next assignment
  /exit                   Leave the terminal client
`);
}

function splitArguments(input) {
  return [...input.matchAll(/"((?:\\.|[^"\\])*)"|(\S+)/g)]
    .map((match) => match[1] ?? match[2]);
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

  if (input === '/members' || input === '/agents') {
    const { members } = await requestJson(baseUrl, '/api/members');
    for (const member of members) {
      console.log(
        `@${member.name}: ${member.role} | ${member.authStatus} | ${member.enabled ? 'enabled' : 'disabled'}`
      );
    }
    return true;
  }

  if (input === '/runs') {
    const { runs } = await requestJson(baseUrl, '/api/runs');
    for (const run of runs.slice(-10)) {
      console.log(`${run.id} | @${run.memberName} | ${run.status}`);
    }
    return true;
  }

  if (input.startsWith('/invite ')) {
    const [name, adapterId, role, workspace] = splitArguments(
      input.slice('/invite '.length)
    );
    if (!name || !adapterId || !role || !workspace) {
      throw new Error('Usage: /invite <name> <provider> <role> <workspace>');
    }
    await requestJson(baseUrl, '/api/members/invite', {
      method: 'POST',
      body: JSON.stringify({ name, adapterId, role, workspace })
    });
    console.log(`@${name} invited. Check authentication before enabling.`);
    return true;
  }

  const memberCommand = input.match(
    /^\/(auth|enable|disable|reset-session)\s+([a-z][a-z0-9_-]{1,31})$/
  );
  if (memberCommand) {
    const [, action, name] = memberCommand;
    const path = action === 'auth'
      ? `/api/members/${name}/auth/check`
      : action === 'reset-session'
        ? `/api/members/${name}/session/reset`
        : `/api/members/${name}/${action}`;
    const result = await requestJson(baseUrl, path, { method: 'POST', body: '{}' });
    console.log(result.message ?? result.status ?? `@${name} updated.`);
    return true;
  }

  const loginCommand = input.match(
    /^\/login\s+([a-z][a-z0-9_-]{1,31})\s+(oauth|device)$/
  );
  if (loginCommand) {
    const [, name, method] = loginCommand;
    const result = await requestJson(baseUrl, `/api/members/${name}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ method })
    });
    console.log(result.message);
    return true;
  }

  if (input.startsWith('/cancel ')) {
    const runId = input.slice('/cancel '.length).trim();
    const { run } = await requestJson(baseUrl, `/api/runs/${runId}/cancel`, {
      method: 'POST', body: '{}'
    });
    console.log(`${run.id}: ${run.status}`);
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

if (!process.stdin.isTTY) {
  const commands = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const command of commands) {
    if (!(await handleInput(command.trim()))) break;
  }
} else {
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
}
