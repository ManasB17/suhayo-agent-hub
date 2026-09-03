# Stage 13 verification: complete local prototype

Date: 2026-09-03

## Claim

The working prototype carries a room assignment from the Docker coordinator to
a native host runner, starts an independent provider session, persists it, and
resumes it on the member's next assignment. The web room also presents provider
login when an authentication check reports `login_required`.

## Evidence

- `npm run check`: passed.
- `npm test`: 42 tests passed, 0 failed.
- `git diff --check`: passed.
- PowerShell launcher and verifier parsing: passed.
- Unix launcher `bash -n`: passed.
- Docker image rebuild: passed.
- Full `scripts/verify-docker-runner.ps1`: passed twice.

Observed end-to-end result:

```text
ContainerHealth  : ok
NativeRunner     : connected
FirstTurn        : E2E_STARTED
SecondTurn       : E2E_RESUMED
SessionPersisted : True
RunsSucceeded    : 2
```

The final hardening pass also verifies bounded host-runner concurrency,
provider-login UI presence, static-file path containment, and guarded recursive
cleanup of temporary test files.

## Safety

The provider was a temporary local PowerShell fixture that emitted representative
Claude JSON. No model tokens, credentials, Suhayo product repository, EC2 host,
Vercel project, production system, or deployment was used. The test container
and temporary files were removed automatically.
