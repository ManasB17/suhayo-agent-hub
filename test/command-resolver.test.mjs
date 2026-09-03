import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareSpawn, resolveCommand } from '../src/command-resolver.mjs';

test('command discovery resolves a Windows PowerShell provider launcher', {
  skip: process.platform !== 'win32'
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-hub-command-'));
  const launcher = join(root, 'codex.ps1');
  writeFileSync(launcher, '# test launcher', 'utf8');

  try {
    assert.equal(resolveCommand('codex', { PATH: root }), launcher);
    const prepared = prepareSpawn('codex', ['exec', 'prompt'], {
      PATH: root,
      SystemRoot: process.env.SystemRoot
    });
    assert.match(prepared.command, /powershell\.exe$/i);
    assert.deepEqual(prepared.arguments.slice(-4), [
      '-File', launcher, 'exec', 'prompt'
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
