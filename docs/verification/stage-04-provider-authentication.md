# Stage 4 verification: provider-native authentication

Date: 2026-09-03

## Claim

An owner can invite a supported local agent and Agent Hub can check or initiate
that provider's native authentication method. Authentication remains owned by
the provider; Agent Hub stores only a sanitized connection state.

## Evidence

- `npm run check`: passed.
- `npm test`: 19 tests passed, 0 failed.
- `git diff --check`: passed.

The focused authentication tests demonstrate:

- invite records include provider, role, workspace, and disabled-by-default state;
- unauthenticated members remain disabled and report `login_required`;
- a selected login method maps to the provider adapter's internal command;
- successful status checks become durable, including legacy configured agents;
- public member responses omit executable commands;
- provider output, credential-shaped test values, and login arguments are absent
  from the append-only event log.

## Safety

All provider calls use an injected fake command executor. No real login session
was started, no credential was read or stored, and no product repository or
deployment was modified.
