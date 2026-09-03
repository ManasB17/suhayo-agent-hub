# Stage 12 verification: Docker, PWA, and launchers

Date: 2026-09-03

## Claim

The coordinator builds and runs as a non-root Docker service with durable local
data, delegates provider execution to the signed native host runner, and serves
an installable standalone PWA. Windows and Unix launchers orchestrate startup.

## Evidence

- `npm run check`: passed.
- `npm test`: 39 tests passed, 0 failed.
- `git diff --check`: passed.
- PowerShell parser: passed.
- Git Bash `bash -n`: passed.
- `docker compose config`: passed with local-only port publishing.
- `docker compose build`: passed using `node:24-alpine`.
- Isolated container health on port 4320: `ok`.
- Container runner mode: `native-host-runner`.
- PWA manifest display mode: `standalone`.
- Service worker request: HTTP 200.

The Docker build context excludes local configuration, events, runner tokens,
Git history, and dependencies. The image runs as the unprivileged `node` user.
The Compose port binds to `127.0.0.1` and data uses a named local volume.

## Cleanup

The isolated Stage 12 container, network, and volume were stopped and removed
after verification. The built local image remains available for later testing.

## Safety

The container used a test-only runner token and no native runner was connected.
No provider, credential, product workspace, EC2, Vercel, or production system
was accessed.
