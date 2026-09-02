import { spawn } from 'node:child_process';

function isApproved(task) {
  return task.status === 'OWNER_APPROVED' || task.status === 'IMPLEMENTING';
}

function recentHistory(task) {
  return task.messages
    .slice(-12)
    .map((message) => `${message.author}: ${message.text}`)
    .join('\n');
}

function createPrompt(task, ownerMessage) {
  const permissionContext = isApproved(task)
    ? `Owner-approved scope: ${task.approvedScope}`
    : [
        'This is design-only work.',
        'Do not modify code, configuration, infrastructure, branches, commits,',
        'deployments, paid API usage, EC2, or Vercel.'
      ].join(' ');

  return [
    `You are collaborating in Agent Hub on task: ${task.name}.`,
    `Task status: ${task.status}.`,
    permissionContext,
    [
      'The owner is the sole approval authority.',
      'Separate facts, inferences, and unknowns.',
      'End with a compact handoff another agent can continue from.'
    ].join(' '),
    `Recent task history:\n${recentHistory(task)}`,
    `New owner message:\n${ownerMessage.text}`
  ].join('\n\n');
}

function commandFor(name, agent, prompt, approved) {
  if (agent.adapter === 'claude' || name === 'claude') {
    return {
      command: agent.command,
      arguments: [
        '-p',
        '--output-format',
        'json',
        '--permission-mode',
        approved ? 'manual' : 'plan',
        prompt
      ]
    };
  }

  if (agent.adapter === 'codex' || name === 'codex') {
    return {
      command: agent.command,
      arguments: [
        'exec',
        '-C',
        agent.workspace,
        '-s',
        approved ? 'workspace-write' : 'read-only',
        '-a',
        'never',
        '--json',
        prompt
      ]
    };
  }

  return { command: agent.command, arguments: [prompt] };
}

export function runAgent(name, agent, task, ownerMessage) {
  const approved = isApproved(task);
  const specification = commandFor(
    name,
    agent,
    createPrompt(task, ownerMessage),
    approved
  );

  return new Promise((resolve) => {
    const child = spawn(specification.command, specification.arguments, {
      cwd: agent.workspace,
      shell: process.platform === 'win32',
      windowsHide: true
    });
    let standardOutput = '';
    let standardError = '';

    child.stdout.on('data', (chunk) => {
      standardOutput += chunk;
    });
    child.stderr.on('data', (chunk) => {
      standardError += chunk;
    });
    child.on('error', (error) => {
      resolve({ ok: false, output: `Could not start @${name}: ${error.message}` });
    });
    child.on('close', (code) => {
      const output = code === 0
        ? standardOutput.trim()
        : `${standardOutput}\n${standardError}`.trim();
      resolve({ ok: code === 0, output: output || 'No response returned.' });
    });
  });
}
