# Stage 5 verification: managed run lifecycle

Date: 2026-09-03

## Claim

Every routed assignment has a durable run identity and transitions through
explicit lifecycle states. Work for one member is serialized while different
members can run independently. Running work can be cancelled or timed out.

## Evidence

- `npm run check`: passed.
- `npm test`: 23 tests passed, 0 failed.
- `git diff --check`: passed.

The focused lifecycle tests demonstrate:

- durable `QUEUED`, `RUNNING`, and `SUCCEEDED` transitions;
- independent run and assignment identifiers;
- sequential execution for one member;
- parallel execution for different members;
- cancellation through an abort signal without a late response being recorded;
- timeout through an abort signal with bounded, sanitized error output;
- successful responses linked back to their originating run.

## Safety

Lifecycle tests use injected in-memory runners. They do not invoke a provider,
touch a product workspace, authenticate, or access a deployment.
