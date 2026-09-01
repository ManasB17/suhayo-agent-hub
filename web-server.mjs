import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataPath = join(root, 'data', 'state.json');
const configPath = join(root, 'config.json');
const exampleConfigPath = join(root, 'config.example.json');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const config = () => json(existsSync(configPath) ? configPath : exampleConfigPath);
const state = () => existsSync(dataPath) ? json(dataPath) : { tasks: [{ id: 'vton-quality', name: 'VTON quality investigation', status: 'OWNER_REVIEW', approvedScope: '', messages: [] }] };
const save = (next) => { mkdirSync(dirname(dataPath), { recursive: true }); writeFileSync(dataPath, JSON.stringify(next, null, 2)); };
const active = (next) => next.tasks[0];
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const targets = (text, agents) => text.toLowerCase().includes('@both') ? Object.keys(agents).filter((name) => agents[name].enabled) : Object.keys(agents).filter((name) => text.toLowerCase().includes(`@${name.toLowerCase()}`));
const context = (task, ownerMessage) => [
  `You are collaborating in Suhayo Agent Hub on ${task.name}. Task state: ${task.status}.`,
  task.status === 'OWNER_APPROVED' || task.status === 'IMPLEMENTING' ? `Owner-approved scope: ${task.approvedScope}` : 'Design only. Do not modify code, configs, infrastructure, branches, commits, deployments, paid API usage, EC2, or Vercel.',
  'The owner is the sole approval authority. Separate facts, inferences, and unknowns. End with a compact handoff.',
  `Recent history:\n${task.messages.slice(-12).map((item) => `${item.author}: ${item.text}`).join('\n')}`,
  `New owner message:\n${ownerMessage.text}`
].join('\n\n');
function invoke(name, agent, task, ownerMessage, done) {
  const approved = task.status === 'OWNER_APPROVED' || task.status === 'IMPLEMENTING';
  let args;
  if (name === 'claude' || agent.adapter === 'claude') args = ['-p', '--output-format', 'json', '--permission-mode', approved ? 'manual' : 'plan', context(task, ownerMessage)];
  else if (name === 'codex' || agent.adapter === 'codex') args = ['exec', '-C', agent.workspace, '-s', approved ? 'workspace-write' : 'read-only', '-a', 'never', '--json', context(task, ownerMessage)];
  else args = [context(task, ownerMessage)];
  const child = spawn(agent.command, args, { cwd: agent.workspace, shell: process.platform === 'win32', windowsHide: true });
  let output = ''; let error = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', (err) => done(`Could not start @${name}: ${err.message}`));
  child.on('close', (code) => done((code === 0 ? output : `${output}\n${error}`).trim()));
}
function file(res, name, type) { res.writeHead(200, { 'Content-Type': type }); res.end(readFileSync(join(root, 'public', name))); }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/') return file(res, 'index.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.js') return file(res, 'app.js', 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.css') return file(res, 'app.css', 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, state());
  let raw = ''; req.on('data', (chunk) => { raw += chunk; }); req.on('end', () => {
    if (req.method !== 'POST') return send(res, 404, { error: 'Not found.' });
    const body = JSON.parse(raw); const next = state(); const task = active(next);
    if (url.pathname === '/api/approve') {
      if (!body.scope?.trim()) return send(res, 400, { error: 'Exact approved scope required.' });
      task.status = 'OWNER_APPROVED'; task.approvedScope = body.scope.trim(); task.messages.push({ id: randomUUID(), author: 'owner', type: 'approval', text: `OWNER_APPROVED: ${task.approvedScope}`, at: new Date().toISOString() }); save(next); return send(res, 200, next);
    }
    if (url.pathname !== '/api/messages' || !body.text?.trim()) return send(res, 400, { error: 'Message required.' });
    const ownerMessage = { id: randomUUID(), author: 'owner', type: 'message', text: body.text.trim(), at: new Date().toISOString() }; task.messages.push(ownerMessage);
    const settings = config();
    for (const name of targets(ownerMessage.text, settings.agents ?? {})) {
      const agent = settings.agents[name]; task.messages.push({ id: randomUUID(), author: name, type: 'status', text: 'Working from the current handoff...', at: new Date().toISOString() });
      invoke(name, agent, task, ownerMessage, (output) => { const current = state(); active(current).messages.push({ id: randomUUID(), author: name, type: 'response', text: output || 'No response returned.', at: new Date().toISOString() }); save(current); });
    }
    save(next); return send(res, 202, next);
  });
});
server.listen(config().port, '127.0.0.1', () => console.log(`Suhayo Agent Hub web interface: http://127.0.0.1:${config().port}`));
