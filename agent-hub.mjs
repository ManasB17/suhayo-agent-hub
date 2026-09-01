import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, 'config.json');
const exampleConfigPath = join(root, 'config.example.json');
const dataPath = join(root, 'data', 'state.json');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const config = () => readJson(existsSync(configPath) ? configPath : exampleConfigPath);
const saveConfig = (next) => writeFileSync(configPath, JSON.stringify(next, null, 2));

function loadState() {
  if (!existsSync(dataPath)) {
    return { tasks: [{ id: 'vton-quality', name: 'VTON quality investigation', status: 'OWNER_REVIEW', approvedScope: '', messages: [] }] };
  }
  return readJson(dataPath);
}

function saveState(next) {
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, JSON.stringify(next, null, 2));
}

function activeTask(nextState) {
  return nextState.tasks[0];
}

function promptFor(task, ownerMessage) {
  const approved = task.status === 'OWNER_APPROVED' || task.status === 'IMPLEMENTING';
  const history = task.messages.slice(-12).map((message) => `${message.author}: ${message.text}`).join('\n');
  return [
    `You are collaborating in the local Suhayo Agent Hub on task: ${task.name}.`,
    `Task status: ${task.status}.`,
    approved ? `Owner-approved scope: ${task.approvedScope}` : 'This is design-only work. Do not modify code, config, infrastructure, branches, commits, deployments, paid API usage, EC2, or Vercel.',
    'The owner is the sole approval authority. Separate facts, inferences, and unknowns. End with a compact handoff another agent can continue from.',
    `Recent task history:\n${history}`,
    `New owner message:\n${ownerMessage.text}`
  ].join('\n\n');
}

function commandFor(name, agent, prompt, approved) {
  if (agent.adapter === 'claude' || name === 'claude') {
    return { command: agent.command, args: ['-p', '--output-format', 'json', '--permission-mode', approved ? 'manual' : 'plan', prompt] };
  }
  if (agent.adapter === 'codex' || name === 'codex') {
    return { command: agent.command, args: ['exec', '-C', agent.workspace, '-s', approved ? 'workspace-write' : 'read-only', '-a', 'never', '--json', prompt] };
  }
  return { command: agent.command, args: [prompt] };
}

function invoke(name, agent, task, ownerMessage) {
  const approved = task.status === 'OWNER_APPROVED' || task.status === 'IMPLEMENTING';
  const spec = commandFor(name, agent, promptFor(task, ownerMessage), approved);
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd: agent.workspace, shell: process.platform === 'win32', windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', (err) => resolve(`Could not start @${name}: ${err.message}`));
    child.on('close', (code) => resolve(code === 0 ? output.trim() : `${output}\n${error}`.trim()));
  });
}

function targetsFor(text, agents) {
  const lower = text.toLowerCase();
  if (lower.includes('@both')) return Object.keys(agents).filter((name) => agents[name].enabled);
  return Object.keys(agents).filter((name) => lower.includes(`@${name.toLowerCase()}`));
}

function printTask(task) {
  console.log(`\n${task.name}\nState: ${task.status}${task.approvedScope ? `\nApproved scope: ${task.approvedScope}` : ''}`);
  if (task.messages.length) {
    console.log('\nRecent handoff:');
    for (const message of task.messages.slice(-6)) console.log(`\n[${message.author}] ${message.text}`);
  }
}

function help() {
  console.log(`
Suhayo Agent Hub commands

  @claude <request>       Route work to Claude Code
  @codex <request>        Route work to Codex
  @both <request>         Route work to every enabled agent
  /status                 Show task state and recent handoff
  /approve <exact scope>  Record owner approval and unlock implementation routing
  /hold                   Return task to OWNER_REVIEW
  /agents                 List configured agents
  /agent add <name> <command>
                           Add an installed CLI as a generic agent
  /agent enable <name>    Enable a configured agent
  /agent disable <name>   Disable an agent
  /exit                   Leave the hub

The history in data/state.json is the cross-agent handoff. Before approval,
Claude runs plan-only and Codex runs read-only. The hub has no deployment path.
`);
}

async function handle(line) {
  const input = line.trim();
  if (!input) return true;
  const nextState = loadState();
  const task = activeTask(nextState);
  const settings = config();

  if (input === '/help') return help();
  if (input === '/status') return printTask(task);
  if (input === '/agents') {
    for (const [name, agent] of Object.entries(settings.agents ?? {})) console.log(`@${name}: ${agent.enabled ? 'enabled' : 'disabled'} (${agent.command})`);
    return true;
  }
  if (input === '/hold') {
    task.status = 'OWNER_REVIEW';
    task.approvedScope = '';
    task.messages.push({ id: randomUUID(), author: 'owner', type: 'state', text: 'Task returned to OWNER_REVIEW.', at: new Date().toISOString() });
    saveState(nextState);
    console.log('Task is now OWNER_REVIEW.');
    return true;
  }
  if (input.startsWith('/approve ')) {
    const scope = input.slice('/approve '.length).trim();
    if (!scope) return console.log('Provide the exact approved scope after /approve.');
    task.status = 'OWNER_APPROVED';
    task.approvedScope = scope;
    task.messages.push({ id: randomUUID(), author: 'owner', type: 'approval', text: `OWNER_APPROVED: ${scope}`, at: new Date().toISOString() });
    saveState(nextState);
    console.log('Owner approval recorded. Implementation routing is now enabled for this exact scope.');
    return true;
  }
  if (input.startsWith('/agent add ')) {
    const [, , name, command] = input.split(/\s+/, 4);
    if (!name || !command) return console.log('Usage: /agent add <name> <command>');
    settings.agents ??= {};
    settings.agents[name.toLowerCase()] = { enabled: false, command, workspace: settings.agents.claude?.workspace ?? process.cwd(), adapter: 'generic' };
    saveConfig(settings);
    console.log(`@${name.toLowerCase()} added and disabled. Use /agent enable ${name.toLowerCase()} after verifying its CLI login.`);
    return true;
  }
  if (input.startsWith('/agent enable ') || input.startsWith('/agent disable ')) {
    const [command, , name] = input.split(/\s+/, 3);
    const agent = settings.agents?.[name?.toLowerCase()];
    if (!agent) return console.log(`Unknown agent: ${name ?? ''}`);
    agent.enabled = command === '/agent' ? input.includes(' enable ') : false;
    saveConfig(settings);
    console.log(`@${name.toLowerCase()} is ${agent.enabled ? 'enabled' : 'disabled'}.`);
    return true;
  }
  if (input === '/exit' || input === '/quit') return false;

  const ownerMessage = { id: randomUUID(), author: 'owner', type: 'message', text: input, at: new Date().toISOString() };
  task.messages.push(ownerMessage);
  const targets = targetsFor(input, settings.agents ?? {});
  if (!targets.length) {
    task.messages.push({ id: randomUUID(), author: 'system', type: 'note', text: 'Request recorded. Mention an enabled agent to route it.', at: new Date().toISOString() });
    saveState(nextState);
    console.log('Recorded. Mention @claude, @codex, or @both to route work.');
    return true;
  }
  saveState(nextState);
  for (const name of targets) {
    const agent = settings.agents[name];
    if (!agent.enabled) {
      console.log(`@${name} is disabled; request recorded only.`);
      continue;
    }
    console.log(`\n@${name} is working...`);
    const response = await invoke(name, agent, task, ownerMessage);
    const current = loadState();
    activeTask(current).messages.push({ id: randomUUID(), author: name, type: 'response', text: response || 'No response returned.', at: new Date().toISOString() });
    saveState(current);
    console.log(`\n@${name}\n${response || 'No response returned.'}\n`);
  }
  return true;
}

console.log('Suhayo Agent Hub - local owner-controlled agent desk');
console.log('Type /help for commands. Type /status to view the current handoff.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const line = await rl.question('\nsuhayo> ');
  if (!(await handle(line))) break;
}
rl.close();
