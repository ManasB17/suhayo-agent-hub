import { spawn } from 'node:child_process';
import { getAdapter } from './adapters/catalog.mjs';

const authenticationTimeoutMs = 5 * 60 * 1000;

export function executeCommand(specification) {
  return new Promise((resolve) => {
    const child = spawn(specification.command, specification.arguments, {
      cwd: specification.cwd,
      env: process.env,
      shell: false,
      windowsHide: true
    });
    let standardOutput = '';
    let standardError = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ ok: false, output: 'Authentication command timed out.' });
    }, authenticationTimeoutMs);

    child.stdout?.on('data', (chunk) => {
      standardOutput += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      standardError += chunk;
    });
    child.on('error', (error) => {
      finish({ ok: false, output: error.message });
    });
    child.on('close', (code) => {
      finish({
        ok: code === 0,
        output: `${standardOutput}\n${standardError}`.trim()
      });
    });
  });
}

function adapterFor(member) {
  const adapter = getAdapter(member.adapterId);
  if (!adapter) throw new Error(`Unknown adapter: ${member.adapterId}`);
  return adapter;
}

function commandFor(member, adapter) {
  return member.command ?? adapter.commands[0];
}

function claudeAuthenticated(output) {
  try {
    const status = JSON.parse(output);
    return status.loggedIn === true
      || status.authenticated === true
      || status.status === 'authenticated';
  } catch {
    return false;
  }
}

export function parseAuthenticationStatus(adapterId, result) {
  if (!result.ok) return 'login_required';
  if (adapterId === 'claude') {
    return claudeAuthenticated(result.output) ? 'connected' : 'login_required';
  }
  if (adapterId === 'codex') {
    return /logged in|authenticated/i.test(result.output)
      ? 'connected'
      : 'login_required';
  }
  return 'connected';
}

export class AuthenticationService {
  constructor(commandExecutor = executeCommand) {
    this.commandExecutor = commandExecutor;
  }

  async check(member) {
    const adapter = adapterFor(member);
    const result = await this.commandExecutor({
      command: commandFor(member, adapter),
      arguments: adapter.authentication.status.arguments,
      cwd: member.workspace,
      purpose: 'authentication_status'
    });
    return {
      status: parseAuthenticationStatus(adapter.id, result),
      message: result.ok
        ? 'Provider authentication status checked.'
        : 'Provider login is required.'
    };
  }

  async login(member, methodId) {
    const adapter = adapterFor(member);
    const method = adapter.authentication.login.find(
      (candidate) => candidate.id === methodId
    );
    if (!method) throw new Error(`Unsupported login method: ${methodId}`);

    const result = await this.commandExecutor({
      command: commandFor(member, adapter),
      arguments: method.arguments,
      cwd: member.workspace,
      purpose: 'provider_login'
    });
    return {
      status: result.ok ? 'check_required' : 'login_required',
      message: result.ok
        ? 'Provider login completed; verify the connection next.'
        : 'Provider login did not complete.'
    };
  }
}
