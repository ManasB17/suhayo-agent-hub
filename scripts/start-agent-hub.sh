#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TOKEN_PATH="$PROJECT_ROOT/.agent-hub-token"
PID_PATH="$PROJECT_ROOT/.host-runner.pid"

docker info >/dev/null
if [ ! -f "$TOKEN_PATH" ]; then
  umask 077
  openssl rand -hex 32 > "$TOKEN_PATH"
fi

AGENT_HUB_RUNNER_TOKEN=$(cat "$TOKEN_PATH")
export AGENT_HUB_RUNNER_TOKEN
docker compose --project-directory "$PROJECT_ROOT" up --detach --build

attempt=0
until node -e "fetch('http://127.0.0.1:4317/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 120 ] || { echo 'Coordinator health check timed out.' >&2; exit 1; }
  sleep 0.5
done

if [ ! -f "$PID_PATH" ] || ! kill -0 "$(cat "$PID_PATH")" 2>/dev/null; then
  AGENT_HUB_URL=http://127.0.0.1:4317 \
    nohup node "$PROJECT_ROOT/host-runner.mjs" >/dev/null 2>&1 &
  echo $! > "$PID_PATH"
fi

if command -v open >/dev/null 2>&1; then open http://127.0.0.1:4317/;
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://127.0.0.1:4317/;
else echo 'Open http://127.0.0.1:4317/'; fi
