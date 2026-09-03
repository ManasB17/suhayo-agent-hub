import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('container excludes credentials and delegates execution to host runner', () => {
  assert.match(read('.dockerignore'), /config\.json/);
  assert.match(read('.dockerignore'), /\.agent-hub-token/);
  assert.match(read('compose.yaml'), /AGENT_HUB_REMOTE_RUNNER/);
  assert.match(read('compose.yaml'), /127\.0\.0\.1:\$\{AGENT_HUB_PORT:-4317\}:4317/);
  assert.match(read('Dockerfile'), /USER node/);
});

test('PWA declares standalone display and a local service worker', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.icons[0].purpose, 'any maskable');
  assert.match(read('public/app.js'), /serviceWorker\.register/);
  assert.match(read('public/app.js'), /data-action="login"/);
});

test('launchers create a local token and start Docker plus native runner', () => {
  const windows = read('scripts/start-agent-hub.ps1');
  const unix = read('scripts/start-agent-hub.sh');
  for (const launcher of [windows, unix]) {
    assert.match(launcher, /AGENT_HUB_RUNNER_TOKEN/);
    assert.match(launcher, /docker compose/);
    assert.match(launcher, /host-runner\.mjs/);
  }
  assert.match(windows, /WindowStyle = 'Hidden'/);
});

test('end-to-end verifier uses an isolated fake provider and two session turns', () => {
  const verifier = read('scripts/verify-docker-runner.ps1');
  assert.match(verifier, /fake-claude\.ps1/);
  assert.match(verifier, /E2E_STARTED/);
  assert.match(verifier, /E2E_RESUMED/);
  assert.match(verifier, /Stop-Process/);
  assert.match(verifier, /docker rm --force/);
});

test('native runner supports bounded parallel jobs', () => {
  const runner = read('host-runner.mjs');
  assert.match(runner, /AGENT_HUB_RUNNER_CONCURRENCY/);
  assert.match(runner, /Promise\.race\(activeJobs\)/);
  assert.match(runner, /Promise\.allSettled\(activeJobs\)/);
});
