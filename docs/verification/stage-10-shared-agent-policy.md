# Stage 10 verification: shared agent policy

Date: 2026-09-03

## Claim

Codex, Claude Code, and future room members have a repository-visible operating
policy that defines owner authority, task gates, handoff requirements,
engineering quality, and production infrastructure boundaries.

## Evidence

- `npm run check`: passed.
- `npm test`: 34 tests passed, 0 failed.
- `git diff --check`: passed.

The focused policy tests demonstrate:

- both `AGENTS.md` and `CLAUDE.md` discover the canonical `AGENT_RULES.md`;
- both provider instruction files include the `OWNER_APPROVED` boundary;
- the shared policy prohibits direct EC2 writes and unapproved deployment;
- capacity failover cannot create new implementation authority;
- every completed feature requires a proof record.

The README was also reconciled with the implemented quoted mentions,
append-only event log, invite/auth/enable commands, persistent sessions, and
current roadmap.

## Safety

This stage changes repository documentation and tests only. It does not modify
Suhayo product repositories, credentials, EC2, Vercel, or any deployment.
