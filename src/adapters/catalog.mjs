const commonCapabilities = Object.freeze({
  independentSessions: true,
  projectRules: true,
  streamingOutput: true
});

export const adapterCatalog = Object.freeze({
  claude: Object.freeze({
    id: 'claude',
    displayName: 'Claude Code',
    commands: ['claude'],
    capabilities: {
      ...commonCapabilities,
      nativeSkills: true,
      nativeHooks: true,
      nativeWorktrees: true
    },
    authentication: {
      status: { arguments: ['auth', 'status', '--json'], format: 'json' },
      login: [
        { id: 'oauth', label: 'Sign in with Anthropic', arguments: ['auth', 'login'] }
      ]
    },
    session: {
      startArguments: ['-p', '--output-format', 'stream-json'],
      resumeArguments: ['-p', '--output-format', 'stream-json', '--resume']
    },
    permissions: {
      investigate: ['--permission-mode', 'plan'],
      implement: ['--permission-mode', 'manual']
    }
  }),
  codex: Object.freeze({
    id: 'codex',
    displayName: 'Codex',
    commands: ['codex'],
    capabilities: {
      ...commonCapabilities,
      nativeSkills: true,
      nativeHooks: true,
      nativeWorktrees: false
    },
    authentication: {
      status: { arguments: ['login', 'status'], format: 'text' },
      login: [
        { id: 'device', label: 'Sign in with device code', arguments: ['login', '--device-auth'] }
      ]
    },
    session: {
      startArguments: ['exec', '--json'],
      resumeArguments: ['exec', 'resume', '--json']
    },
    permissions: {
      investigate: ['--sandbox', 'read-only', '--ask-for-approval', 'never'],
      implement: ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']
    }
  }),
  grok: Object.freeze({
    id: 'grok',
    displayName: 'Grok Build',
    commands: ['grok'],
    capabilities: {
      ...commonCapabilities,
      nativeSkills: true,
      nativeHooks: false,
      nativeWorktrees: true
    },
    authentication: {
      status: { arguments: ['models'], format: 'text' },
      login: [
        { id: 'oauth', label: 'Sign in with xAI', arguments: ['login', '--oauth'] },
        { id: 'device', label: 'Use a device code', arguments: ['login', '--device-auth'] }
      ]
    },
    session: {
      startArguments: ['--single', '--output-format', 'streaming-json'],
      resumeArguments: ['--single', '--output-format', 'streaming-json', '--resume']
    },
    permissions: {
      investigate: ['--permission-mode', 'plan'],
      implement: ['--permission-mode', 'default']
    }
  })
});

export function getAdapter(id) {
  return adapterCatalog[id] ?? null;
}

export function publicAdapterCatalog() {
  return Object.values(adapterCatalog).map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    commands: adapter.commands,
    capabilities: adapter.capabilities,
    authentication: {
      loginMethods: adapter.authentication.login.map(({ id, label }) => ({ id, label }))
    }
  }));
}
