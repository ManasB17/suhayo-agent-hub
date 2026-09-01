import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('example configuration keeps built-in agents disabled', async () => {
  const source = await readFile(new URL('config.example.json', root), 'utf8');
  const configuration = JSON.parse(source);

  assert.equal(configuration.agents.claude.enabled, false);
  assert.equal(configuration.agents.codex.enabled, false);
  assert.equal(typeof configuration.agents.claude.command, 'string');
  assert.equal(typeof configuration.agents.codex.command, 'string');
});

test('package exposes terminal, web, and quality commands', async () => {
  const source = await readFile(new URL('package.json', root), 'utf8');
  const packageJson = JSON.parse(source);

  assert.equal(typeof packageJson.scripts.start, 'string');
  assert.equal(typeof packageJson.scripts.web, 'string');
  assert.equal(typeof packageJson.scripts.check, 'string');
  assert.equal(typeof packageJson.scripts.test, 'string');
});
