import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('provider instruction files discover the shared owner gate', () => {
  for (const path of ['AGENTS.md', 'CLAUDE.md']) {
    const instructions = read(path);
    assert.match(instructions, /AGENT_RULES\.md/);
    assert.match(instructions, /OWNER_APPROVED/);
  }
});

test('shared policy prohibits direct production writes and requires proof', () => {
  const policy = read('AGENT_RULES.md');
  assert.match(policy, /Never write directly to EC2/);
  assert.match(policy, /Never deploy/);
  assert.match(policy, /docs\/verification/);
  assert.match(policy, /Failover\s+never creates new implementation authority/);
});
