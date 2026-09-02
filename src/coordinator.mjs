import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { loadConfig, projectRoot } from './config.mjs';
import { EventStore } from './event-store.mjs';
import { runAgent } from './agent-runner.mjs';
import { parseAssignments, resolveAssignments } from './mentions.mjs';
import { createEvent, createMessage } from './state.mjs';
import { publicAdapterCatalog } from './adapters/catalog.mjs';
import { getAdapter } from './adapters/catalog.mjs';
import { AuthenticationService } from './auth-service.mjs';
import { RunManager } from './run-manager.mjs';
import { randomUUID } from 'node:crypto';

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

function configuredMembers(settings, state) {
  const durableMembers = new Map(
    state.members.map((member) => [member.name, member])
  );
  for (const [name, agent] of Object.entries(settings.agents ?? {})) {
    if (durableMembers.has(name)) {
      durableMembers.set(name, {
        ...durableMembers.get(name),
        command: agent.command,
        enabled: Boolean(agent.enabled)
      });
      continue;
    }
    durableMembers.set(name, {
      name,
      adapterId: agent.adapter ?? name,
      role: agent.role ?? 'member',
      workspace: agent.workspace,
      command: agent.command,
      enabled: Boolean(agent.enabled),
      authStatus: 'unknown'
    });
  }
  return [...durableMembers.values()];
}

function publicMember(member) {
  const { command, ...safeMember } = member;
  return safeMember;
}

function findMember(settings, state, name) {
  return configuredMembers(settings, state).find(
    (member) => member.name === name
  );
}

function validMemberName(name) {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(name);
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

async function dispatchAssignments(
  store,
  task,
  ownerMessage,
  assignments,
  runManager
) {
  if (!assignments.length) {
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

  for (const assignment of assignments) {
    const { configuration, instruction, name } = assignment;
    if (!configuration) {
      store.append(createEvent('MESSAGE_ADDED', {
        taskId: task.id,
        message: createMessage(
          'system',
          'error',
          `@${name} is not a member of this room.`
        )
      }));
      continue;
    }
    if (!configuration.enabled) {
      store.append(createEvent('MESSAGE_ADDED', {
        taskId: task.id,
        message: createMessage(
          'system',
          'error',
          `@${name} is a member but is not enabled.`
        )
      }));
      continue;
    }

    const assignmentId = randomUUID();
    store.append(createEvent('MESSAGE_ADDED', {
      taskId: task.id,
      message: createMessage(
        name,
        'status',
        `Working on: ${instruction}`,
        { assignmentId }
      )
    }));

    const targetedMessage = {
      ...ownerMessage,
      text: instruction,
      assignmentId
    };
    runManager.start({
      memberName: name,
      configuration,
      task: store.readState().tasks.find(
        (candidate) => candidate.id === task.id
      ),
      message: targetedMessage
    });
  }
}

export function createCoordinator(options = {}) {
  const root = options.root ?? projectRoot;
  const settings = options.config ?? loadConfig(root);
  const store = options.store ?? new EventStore(root);
  const runner = options.runAgent ?? runAgent;
  const authentication = options.authentication
    ?? new AuthenticationService(options.executeCommand);
  const runManager = options.runManager ?? new RunManager({
    store,
    runner,
    timeoutMs: options.runTimeoutMs
  });

  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }

      if (request.method === 'GET' && url.pathname === '/api/state') {
        return sendJson(response, 200, store.readState());
      }

      if (request.method === 'GET' && url.pathname === '/api/runs') {
        return sendJson(response, 200, { runs: store.readState().runs });
      }

      const cancelMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
      if (request.method === 'POST' && cancelMatch) {
        const run = runManager.cancel(cancelMatch[1]);
        return sendJson(response, 200, { run });
      }

      if (request.method === 'GET' && url.pathname === '/api/agents') {
        const agents = Object.entries(settings.agents ?? {}).map(([name, agent]) => ({
          name,
          command: agent.command,
          enabled: agent.enabled,
          workspace: agent.workspace,
          role: agent.role ?? 'member',
          aliases: agent.aliases ?? []
        }));
        return sendJson(response, 200, { agents });
      }

      if (request.method === 'GET' && url.pathname === '/api/adapters') {
        return sendJson(response, 200, { adapters: publicAdapterCatalog() });
      }

      if (request.method === 'GET' && url.pathname === '/api/members') {
        const members = configuredMembers(settings, store.readState())
          .map(publicMember);
        return sendJson(response, 200, { members });
      }

      if (request.method === 'POST' && url.pathname === '/api/members/invite') {
        const body = await readJsonBody(request);
        const name = body.name?.trim().toLowerCase();
        const adapter = getAdapter(body.adapterId);
        if (!validMemberName(name ?? '')) {
          return sendJson(response, 400, { error: 'Use a valid member name.' });
        }
        if (!adapter) {
          return sendJson(response, 400, { error: 'Choose a supported adapter.' });
        }
        if (!body.workspace?.trim()) {
          return sendJson(response, 400, { error: 'Workspace is required.' });
        }

        const member = {
          name,
          adapterId: adapter.id,
          role: body.role?.trim() || 'member',
          workspace: body.workspace.trim(),
          enabled: false,
          authStatus: 'unknown'
        };
        store.append(createEvent('MEMBER_INVITED', { member }));
        return sendJson(response, 201, { member: publicMember(member) });
      }

      const authMatch = url.pathname.match(
        /^\/api\/members\/([a-z][a-z0-9_-]{1,31})\/auth\/(check|login)$/
      );
      if (request.method === 'POST' && authMatch) {
        const [, name, action] = authMatch;
        const member = findMember(settings, store.readState(), name);
        if (!member) return sendJson(response, 404, { error: 'Member not found.' });

        const body = await readJsonBody(request);
        const result = action === 'check'
          ? await authentication.check(member)
          : await authentication.login(member, body.method);
        if (!store.readState().members.some((candidate) => candidate.name === name)) {
          store.append(createEvent('MEMBER_INVITED', {
            member: publicMember(member)
          }));
        }
        store.append(createEvent('MEMBER_AUTH_SET', {
          name,
          status: result.status,
          message: result.message
        }));
        return sendJson(response, 200, result);
      }

      if (request.method === 'POST' && url.pathname === '/api/messages') {
        const body = await readJsonBody(request);
        if (!body.text?.trim()) {
          return sendJson(response, 400, { error: 'Message text is required.' });
        }

        const parsedAssignments = parseAssignments(body.text.trim());
        const assignments = resolveAssignments(
          parsedAssignments,
          settings.agents ?? {}
        );
        const state = store.readState();
        const task = activeTask(state);
        const ownerMessage = createMessage('owner', 'message', body.text.trim());
        store.append(createEvent('MESSAGE_ADDED', {
          taskId: task.id,
          message: ownerMessage
        }));
        await dispatchAssignments(
          store,
          task,
          ownerMessage,
          assignments,
          runManager
        );
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
