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

function permissionMode(task) {
  return isApproved(task) ? 'implement' : 'investigate';
}

export function buildAgentCommand(name, agent, task, prompt, sessionId) {
  const adapterId = agent.adapter ?? name;
  const mode = permissionMode(task);

  if (adapterId === 'claude') {
    const argumentsList = [
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      mode === 'implement' ? 'manual' : 'plan'
    ];
    if (sessionId) argumentsList.push('--resume', sessionId);
    argumentsList.push(prompt);
    return { command: agent.command, arguments: argumentsList };
  }

  if (adapterId === 'codex') {
    const sandbox = mode === 'implement' ? 'workspace-write' : 'read-only';
    const common = [
      '-c',
      'approval_policy="never"',
      '-c',
      `sandbox_mode="${sandbox}"`,
      '--json'
    ];
    return sessionId
      ? {
          command: agent.command,
          arguments: ['exec', 'resume', ...common, sessionId, prompt]
        }
      : {
          command: agent.command,
          arguments: ['exec', '-C', agent.workspace, '-s', sandbox, ...common, prompt]
        };
  }

  if (adapterId === 'grok') {
    const argumentsList = [
      '--output-format',
      'streaming-json',
      '--permission-mode',
      mode === 'implement' ? 'default' : 'plan'
    ];
    if (sessionId) argumentsList.push('--resume', sessionId);
    argumentsList.push('--single', prompt);
    return { command: agent.command, arguments: argumentsList };
  }

  return { command: agent.command, arguments: [prompt] };
}

function parseJsonLines(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function normalizeClaude(output) {
  try {
    const result = JSON.parse(output);
    return {
      output: result.result ?? result.message ?? output,
      sessionId: result.session_id ?? result.sessionId
    };
  } catch {
    return { output };
  }
}

function normalizeEventStream(output) {
  const events = parseJsonLines(output);
  const sessionEvent = events.find((event) =>
    event.thread_id || event.session_id || event.sessionId
  );
  const messages = events.flatMap((event) => {
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      return [event.item.text];
    }
    if (event.type === 'result' && typeof event.result === 'string') {
      return [event.result];
    }
    if (event.type === 'assistant' && typeof event.message === 'string') {
      return [event.message];
    }
    return [];
  }).filter(Boolean);
  return {
    output: messages.join('\n\n') || output,
    sessionId: sessionEvent?.thread_id
      ?? sessionEvent?.session_id
      ?? sessionEvent?.sessionId
  };
}

export function normalizeAgentOutput(adapterId, output) {
  if (adapterId === 'claude') return normalizeClaude(output);
  if (adapterId === 'codex' || adapterId === 'grok') {
    return normalizeEventStream(output);
  }
  return { output };
}

export function runAgent(name, agent, task, ownerMessage, options = {}) {
  const adapterId = agent.adapter ?? name;
  const specification = buildAgentCommand(
    name,
    agent,
    task,
    createPrompt(task, ownerMessage),
    options.sessionId
  );

  return new Promise((resolve) => {
    const child = spawn(specification.command, specification.arguments, {
      cwd: agent.workspace,
      shell: false,
      signal: options.signal,
      windowsHide: true
    });
    let standardOutput = '';
    let standardError = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on('data', (chunk) => {
      standardOutput += chunk;
    });
    child.stderr.on('data', (chunk) => {
      standardError += chunk;
    });
    child.on('error', (error) => {
      finish({ ok: false, output: `Could not start @${name}: ${error.message}` });
    });
    child.on('close', (code) => {
      const rawOutput = code === 0
        ? standardOutput.trim()
        : `${standardOutput}\n${standardError}`.trim();
      const normalized = normalizeAgentOutput(adapterId, rawOutput);
      finish({
        ok: code === 0,
        output: normalized.output || 'No response returned.',
        sessionId: normalized.sessionId
      });
    });
  });
}
