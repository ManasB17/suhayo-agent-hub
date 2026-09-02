import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { loadConfig, projectRoot } from './config.mjs';
import { EventStore } from './event-store.mjs';
import { runAgent } from './agent-runner.mjs';
import { createEvent, createMessage } from './state.mjs';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function activeTask(state) {
  return state.tasks.find((task) => task.id === state.activeTaskId)
    ?? state.tasks[0];
}

function mentionedAgents(text, agents) {
  const normalizedText = text.toLowerCase();
  if (normalizedText.includes('@both')) {
    return Object.keys(agents).filter((name) => agents[name].enabled);
  }

  return Object.keys(agents).filter((name) =>
    normalizedText.includes(`@${name.toLowerCase()}`)
  );
}

function serveStatic(response, pathname, root) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const publicRoot = join(root, 'public');
  const filePath = normalize(join(publicRoot, requestedPath));

  if (!filePath.startsWith(publicRoot) || !existsSync(filePath)) return false;
  if (!statSync(filePath).isFile()) return false;

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
  return true;
}

async function dispatchAgents(store, settings, task, ownerMessage) {
  const targets = mentionedAgents(ownerMessage.text, settings.agents ?? {});

  if (!targets.length) {
    store.append(createEvent('MESSAGE_ADDED', {
      taskId: task.id,
      message: createMessage(
        'system',
        'note',
        'Request recorded. Mention an enabled agent to route it.'
      )
    }));
    return;
  }

  for (const name of targets) {
    const agent = settings.agents[name];
    store.append(createEvent('MESSAGE_ADDED', {
      taskId: task.id,
      message: createMessage(name, 'status', 'Working from the current handoff...')
    }));

    runAgent(name, agent, store.readState().tasks.find(
      (candidate) => candidate.id === task.id
    ), ownerMessage).then((result) => {
      store.append(createEvent('MESSAGE_ADDED', {
        taskId: task.id,
        message: createMessage(
          name,
          result.ok ? 'response' : 'error',
          result.output
        )
      }));
    });
  }
}

export function createCoordinator(options = {}) {
  const root = options.root ?? projectRoot;
  const settings = options.config ?? loadConfig(root);
  const store = options.store ?? new EventStore(root);

  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }

      if (request.method === 'GET' && url.pathname === '/api/state') {
        return sendJson(response, 200, store.readState());
      }

      if (request.method === 'GET' && url.pathname === '/api/agents') {
        const agents = Object.entries(settings.agents ?? {}).map(([name, agent]) => ({
          name,
          command: agent.command,
          enabled: agent.enabled,
          workspace: agent.workspace
        }));
        return sendJson(response, 200, { agents });
      }

      if (request.method === 'POST' && url.pathname === '/api/messages') {
        const body = await readJsonBody(request);
        if (!body.text?.trim()) {
          return sendJson(response, 400, { error: 'Message text is required.' });
        }

        const state = store.readState();
        const task = activeTask(state);
        const ownerMessage = createMessage('owner', 'message', body.text.trim());
        store.append(createEvent('MESSAGE_ADDED', {
          taskId: task.id,
          message: ownerMessage
        }));
        await dispatchAgents(store, settings, task, ownerMessage);
        return sendJson(response, 202, store.readState());
      }

      if (request.method === 'POST' && url.pathname === '/api/approve') {
        const body = await readJsonBody(request);
        if (!body.scope?.trim()) {
          return sendJson(response, 400, { error: 'Exact approved scope is required.' });
        }

        const task = activeTask(store.readState());
        const scope = body.scope.trim();
        store.appendMany([
          createEvent('TASK_STATUS_SET', {
            taskId: task.id,
            status: 'OWNER_APPROVED',
            approvedScope: scope
          }),
          createEvent('MESSAGE_ADDED', {
            taskId: task.id,
            message: createMessage('owner', 'approval', `OWNER_APPROVED: ${scope}`)
          })
        ]);
        return sendJson(response, 200, store.readState());
      }

      if (request.method === 'POST' && url.pathname === '/api/hold') {
        const task = activeTask(store.readState());
        store.appendMany([
          createEvent('TASK_STATUS_SET', {
            taskId: task.id,
            status: 'OWNER_REVIEW',
            approvedScope: ''
          }),
          createEvent('MESSAGE_ADDED', {
            taskId: task.id,
            message: createMessage(
              'owner',
              'state',
              'Task returned to OWNER_REVIEW.'
            )
          })
        ]);
        return sendJson(response, 200, store.readState());
      }

      if (request.method === 'GET' && serveStatic(response, url.pathname, root)) {
        return;
      }

      return sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  });
}

export function startCoordinator(options = {}) {
  const settings = options.config ?? loadConfig(options.root ?? projectRoot);
  const configuredPort = Number(process.env.AGENT_HUB_PORT ?? settings.port);
  const server = createCoordinator({ ...options, config: settings });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(configuredPort, '127.0.0.1', () => resolve(server));
  });
}
