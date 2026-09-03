# Stage 11 verification: native host runner boundary

Date: 2026-09-03

## Claim

The coordinator can queue provider work for a native host runner instead of
executing host-installed CLIs inside Docker. The runner polls outward, claims a
job using a high-entropy shared token, executes locally, and returns the result.

## Evidence

- `npm run check`: passed.
- `npm test`: 36 tests passed, 0 failed.
- `git diff --check`: passed.

The focused integration test demonstrates:

- a quoted assignment creates a host-runner job;
- an unauthenticated claim receives HTTP 401;
- the valid runner receives the provider, task, session, and instruction payload;
- completion resolves the durable run and room response;
- constant-time token comparison rejects short and lookalike values;
- tokens shorter than 32 characters are rejected during startup.

## Safety

The test uses a fake completion and temporary local coordinator. No provider CLI,
credential, product workspace, container, EC2, Vercel, or deployment is used.
