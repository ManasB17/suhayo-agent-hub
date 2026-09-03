# Stage 8 verification: role-based continuity

Date: 2026-09-03

## Claim

Provider capacity exhaustion can hand an existing assignment to one enabled,
authenticated member with the same role. The handoff is durable, structured,
linked to both runs, and limited to one automatic continuation hop.

## Evidence

- `npm run check`: passed.
- `npm test`: 32 tests passed, 0 failed.
- `git diff --check`: passed.

The focused tests demonstrate:

- capacity exhaustion is distinguished from authentication failure;
- a compatible backup receives the original instruction and source member;
- the handoff records task, assignment, source run, members, and reason;
- the continuation run links back to its source run and succeeds;
- one-hop depth prevents an automatic fallback loop.

## Safety

Failover tests use fake providers and temporary event stores. No model, product
workspace, credential, production system, or deployment is accessed.
