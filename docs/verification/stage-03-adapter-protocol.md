# Stage 3 verification: agent adapter capability protocol

Date: 2026-09-03

## Claim

Agent Hub has a validated provider-neutral contract for discovery,
authentication, independent sessions, permissions, skills, hooks, project rules,
streaming output, and worktree support. Claude Code, Codex, and Grok Build are
represented as built-in adapters.

## Evidence

- `npm run check`: passed.
- `npm test`: 16 tests passed, 0 failed.
- `git diff --check`: passed.

The focused adapter tests demonstrate:

- every built-in adapter satisfies the same required contract;
- Claude Code, Codex, and Grok Build are discoverable in the catalog;
- capability differences are explicit booleans instead of assumptions;
- the public API exposes safe login method identifiers and labels;
- executable arguments and provider login commands are not exposed publicly.

## Safety

Tests only validate static adapter declarations and an in-process HTTP endpoint.
They do not run an agent, initiate authentication, modify a product repository,
or access a deployment.
