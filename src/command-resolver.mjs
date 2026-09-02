import { existsSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join } from 'node:path';

const windowsExtensions = ['', '.exe', '.com', '.cmd', '.bat', '.ps1'];

export function resolveCommand(command, environment = process.env) {
  if (isAbsolute(command)) return existsSync(command) ? command : null;

  const directories = (environment.PATH ?? environment.Path ?? '')
    .split(delimiter)
    .filter(Boolean);
  const extensions = process.platform === 'win32' ? windowsExtensions : [''];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function prepareSpawn(command, argumentsList, environment = process.env) {
  const resolved = resolveCommand(command, environment) ?? command;
  const extension = extname(resolved).toLowerCase();
  if (extension === '.ps1') {
    return {
      command: environment.SystemRoot
        ? join(environment.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe',
      arguments: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolved,
        ...argumentsList
      ]
    };
  }
  return { command: resolved, arguments: argumentsList };
}
