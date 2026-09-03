const $ = (query) => document.querySelector(query);
let adapters = [];

const escapeHtml = (value = '') => {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
};

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed.');
  return body;
}

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

function renderTask(state) {
  const task = state.tasks.find((candidate) => candidate.id === state.activeTaskId)
    ?? state.tasks[0];
  $('#name').textContent = task.name;
  $('#status').textContent = task.status.replaceAll('_', ' ');
  const activeRuns = state.runs.filter((run) =>
    run.status === 'QUEUED' || run.status === 'RUNNING'
  );
  $('#run-summary').textContent = activeRuns.length
    ? `${activeRuns.length} active run${activeRuns.length === 1 ? '' : 's'}`
    : 'Team idle';
  $('#messages').innerHTML = task.messages.map((message) => `
    <article class="message ${escapeHtml(message.author)} ${escapeHtml(message.type)}">
      <div class="message-head"><strong>${escapeHtml(message.author)}</strong><time>${new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
      <div class="message-body">${escapeHtml(message.text)}</div>
    </article>
  `).join('') || '<div class="empty"><strong>The room is ready.</strong><span>Mention a team member to begin an assignment.</span></div>';
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

function renderMembers(members) {
  $('#members').innerHTML = members.map((member) => {
    const connected = member.authStatus === 'connected';
    const adapter = adapters.find((candidate) => candidate.id === member.adapterId);
    const loginMethod = adapter?.authentication.loginMethods[0];
    const stateLabel = member.enabled ? 'available' : member.authStatus.replaceAll('_', ' ');
    return `
      <article class="member-card" data-member="${escapeHtml(member.name)}">
        <div class="avatar">${escapeHtml(member.name.slice(0, 1).toUpperCase())}</div>
        <div class="member-copy"><strong>@${escapeHtml(member.name)}</strong><span>${escapeHtml(member.role)}</span><small class="${member.enabled ? 'online' : ''}">${escapeHtml(stateLabel)}</small></div>
        <div class="member-actions">
          ${connected
            ? `<button data-action="${member.enabled ? 'disable' : 'enable'}">${member.enabled ? 'Pause' : 'Enable'}</button>`
            : member.authStatus === 'login_required' && loginMethod
              ? `<button data-action="login" data-method="${escapeHtml(loginMethod.id)}">Sign in</button>`
              : '<button data-action="check">Check login</button>'}
        </div>
      </article>`;
  }).join('') || '<p class="no-members">Invite an installed agent to build your team.</p>';
}

async function refresh() {
  const [state, memberData] = await Promise.all([
    api('/api/state'),
    api('/api/members')
  ]);
  renderTask(state);
  renderMembers(memberData.members);
}

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('#text').value.trim();
  if (!text) return;
  try {
    await api('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    $('#text').value = '';
    await refresh();
  } catch (error) { notify(error.message); }
});

$('#members').addEventListener('click', async (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  const name = event.target.closest('[data-member]').dataset.member;
  try {
    if (action === 'check') {
      const result = await api(`/api/members/${name}/auth/check`, {
        method: 'POST', body: '{}'
      });
      notify(result.status === 'connected'
        ? `@${name} is connected.`
        : `@${name} needs provider login.`);
    } else if (action === 'login') {
      notify(`Opening @${name}'s provider login...`);
      const result = await api(`/api/members/${name}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: event.target.dataset.method })
      });
      notify(result.message);
    } else {
      await api(`/api/members/${name}/${action}`, { method: 'POST', body: '{}' });
    }
    await refresh();
  } catch (error) { notify(error.message); }
});

$('#approve').onclick = () => $('#approval-dialog').showModal();
$('#invite-open').onclick = () => $('#invite-dialog').showModal();
document.querySelectorAll('[data-close]').forEach((button) => {
  button.onclick = () => button.closest('dialog').close();
});

$('#approval').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const state = await api('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: $('#scope').value })
    });
    renderTask(state);
    $('#approval-dialog').close();
  } catch (error) { notify(error.message); }
});

$('#invite').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/members/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#member-name').value,
        adapterId: $('#adapter').value,
        role: $('#role').value,
        workspace: $('#workspace').value
      })
    });
    $('#invite-dialog').close();
    event.target.reset();
    await refresh();
  } catch (error) { notify(error.message); }
});

async function initialize() {
  const data = await api('/api/adapters');
  adapters = data.adapters;
  $('#adapter').innerHTML = adapters.map((adapter) =>
    `<option value="${escapeHtml(adapter.id)}">${escapeHtml(adapter.displayName)}</option>`
  ).join('');
  await refresh();
  setInterval(() => refresh().catch(() => undefined), 2500);
}

initialize().catch((error) => notify(error.message));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
}
