# Suhayo Agent Hub

Suhayo Agent Hub is a local, owner-controlled command center for coding agents. It provides one shared task history and two interfaces: an interactive terminal and a local web view. It is designed for people who use multiple terminal-based agents but do not want to coordinate work across separate windows, chats, or provider-hosted collaboration tools.

## The problem

Modern coding agents are powerful but difficult to operate as a team. A project owner may work with Claude Code, Codex, and other installed agents, yet still have to:

- Repeat context in separate terminals and applications.
- Manually transfer partial findings when an agent reaches a token limit.
- Reconstruct the current task state before another agent can review or continue it.
- Prevent an agent from treating an investigation as permission to implement or deploy.

Agent Hub creates a local task room where the owner can route work with `@claude`, `@codex`, or `@both`. The task history is persisted locally and supplied as a bounded handoff to the next agent. The owner remains the sole authority for implementation scope.

## Design goals

- Local-first: task data stays on the device by default.
- Provider-neutral: installed command-line agents can be registered as teammates.
- Owner-gated: implementation is unavailable until the owner records an exact approved scope.
- Resilient handoffs: a second agent can continue from the latest shared task record.
- Explicit safety: no SSH, EC2, Vercel, deployment, or secret-management feature is built into the application.

## Interfaces

### Terminal

```powershell
npm start
```

Use the `suhayo>` prompt:

```text
@claude investigate the current regression evidence
@codex challenge the proposal and identify missing tests
@both prepare the owner decision
/status
/approve Implement backend candidate evaluation only. No deployment or paid production calls.
```

Run `/help` for the complete command list.

### Local web view

```powershell
npm run web
```

Open `http://127.0.0.1:4317`. The web view and terminal use the same local task record.

## Setup

Requirements:

- Node.js 20 or later
- An installed and authenticated agent CLI for each agent you enable

The repository includes a safe starting `config.json`: Claude and Codex are registered but disabled. Enable an agent only after verifying its local command and workspace path. Machine-specific configuration is ignored by Git; `config.example.json` is the portable reference configuration.

To register another installed CLI from the terminal:

```text
/agent add <name> <command>
/agent enable <name>
```

Generic agents begin disabled. Their command behavior should be verified before they are used on a project workspace.

## Safety model

Before a task is approved, Claude is invoked with plan-only permissions and Codex is invoked in a read-only sandbox. Agent prompts prohibit code changes, branches, commits, deployment, paid API use, EC2 access, and Vercel access.

After `/approve <exact scope>`, the application records the scope and can route implementation work. Approval is task-specific. Use `/hold` to return the task to review mode.

This is a coordination layer, not a replacement for repository protections. Projects should still maintain branch protections, deployment controls, least-privilege credentials, and explicit infrastructure policies.

## Data and privacy

Task history is written to `data/state.json` on the local device. Do not commit that file: it can contain project context and agent output. The application does not send data to a relay service. Agent CLIs may independently communicate with their configured providers.

## Development

```powershell
npm run check
npm test
```

The project uses Node.js built-ins and has no runtime npm dependencies. JavaScript uses ESM, descriptive names, 2-space indentation, and `node --check` as a baseline syntax gate. There is currently no Python code in this repository; any future Python contribution should follow PEP 8, use type annotations where practical, and include focused tests.

## Roadmap

- Multiple named tasks and task selection
- Agent-specific resume/session adapters
- Structured handoff summaries
- Configurable approval roles for teams
- Adapter packages for additional local agent CLIs

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before opening an issue or pull request.

## License

Suhayo Agent Hub is released under the [MIT License](LICENSE).
