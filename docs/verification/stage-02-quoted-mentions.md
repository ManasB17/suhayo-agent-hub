# Stage 2 verification: quoted multi-agent mentions

Date: 2026-09-03

## Claim

One owner message can assign different instructions to independent room members
using `@agent "instruction"` or `@agent \`instruction\`` syntax. Aliases resolve
to canonical members, and native slash commands inside an assignment are not
interpreted by Agent Hub.

## Evidence

- `npm run check`: passed.
- `npm test`: 13 tests passed, 0 failed.
- `git diff --check`: passed.

The focused parser and coordinator tests demonstrate:

- separate quoted assignments in one message;
- double-quote and backtick delimiters;
- escaped quotes;
- raw agent-native slash commands;
- single-agent unquoted shorthand;
- rejection of ambiguous multi-agent shorthand;
- `@chatgpt` alias resolution to the Codex member;
- independent instruction delivery to two fake agent sessions.

## Safety

Dispatch tests use injected fake runners and do not invoke an authenticated agent
or modify a project repository.
