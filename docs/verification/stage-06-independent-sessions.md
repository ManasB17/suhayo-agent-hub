# Stage 6 verification: independent persistent sessions

Date: 2026-09-03

## Claim

Each room member owns a separate durable provider session. A member resumes its
own session on subsequent assignments, while another member starts independently.
Provider output is normalized into room messages, and stale sessions can be reset.

## Evidence

- `npm run check`: passed.
- `npm test`: 27 tests passed, 0 failed.
- `git diff --check`: passed.

The focused session tests demonstrate:

- Claude Code, Codex, and Grok Build receive provider-correct resume arguments;
- slash-command text remains the provider prompt;
- Claude JSON and Codex JSONL produce normalized assistant text and session IDs;
- a second Claude assignment resumes Claude's durable session;
- a concurrent Codex assignment starts a separate Codex session;
- an owner-facing reset endpoint clears a stale session.

The installed CLI help was also inspected for `claude`, `codex exec resume`, and
`grok` to verify current command shapes without starting an agent session.

## Safety

Automated tests use fake runners and representative provider event fixtures. CLI
help inspection did not authenticate, consume model tokens, modify a product
workspace, or access a deployment.
