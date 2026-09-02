import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MentionSyntaxError,
  parseAssignments,
  resolveAssignments
} from '../src/mentions.mjs';

test('quoted mentions preserve separate instructions', () => {
  const assignments = parseAssignments(
    '@chatgpt "Review candidate selection." @claude `Design the eval harness.`'
  );

  assert.deepEqual(assignments, [
    { agent: 'chatgpt', instruction: 'Review candidate selection.' },
    { agent: 'claude', instruction: 'Design the eval harness.' }
  ]);
});

test('quoted assignments preserve native slash commands and escaped quotes', () => {
  const assignments = parseAssignments(
    '@claude "/research check \\"black hoodie\\" failures"'
  );

  assert.equal(
    assignments[0].instruction,
    '/research check "black hoodie" failures'
  );
});

test('one unquoted mention consumes the remaining message', () => {
  assert.deepEqual(parseAssignments('@claude investigate the regression'), [
    { agent: 'claude', instruction: 'investigate the regression' }
  ]);
});

test('multiple unquoted mentions are rejected as ambiguous', () => {
  assert.throws(
    () => parseAssignments('@claude first task @codex second task'),
    MentionSyntaxError
  );
});

test('aliases resolve to canonical room members', () => {
  const agents = {
    codex: {
      enabled: true,
      aliases: ['chatgpt'],
      command: 'codex'
    }
  };
  const [assignment] = resolveAssignments(
    parseAssignments('@chatgpt "Review this."'),
    agents
  );

  assert.equal(assignment.name, 'codex');
  assert.equal(assignment.instruction, 'Review this.');
});
