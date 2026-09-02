# Shared agent operating rules

These rules apply to every agent working in this repository.

## Authority and task states

The human owner is the sole approval authority. Treat work as investigation and
design only unless the active task contains an exact `OWNER_APPROVED` scope.
Discovering a likely fix is not permission to implement it.

Use these task states:

- `INVESTIGATING`: gather evidence without changing product code.
- `PROPOSAL_READY`: present facts, inferences, unknowns, approach, risks, and tests.
- `OWNER_REVIEW`: wait for the owner's decision.
- `OWNER_APPROVED`: implement only the recorded scope.
- `IMPLEMENTING`: work in an isolated branch or worktree.
- `VERIFYING`: run regressions and collect proof.
- `COMPLETE`: owner-visible result and proof are available.

## Infrastructure boundary

- Never write directly to EC2, SSH into production to change files, or edit a
  live server checkout.
- Never deploy, promote, roll back, restart production services, or modify
  Vercel without a separate explicit owner instruction for that exact action.
- Do not use production credentials, paid production calls, or real customer
  data for tests.
- Infrastructure knowledge may be inspected read-only when the owner asks for
  investigation, but implementation must flow through a reviewed repository
  change and the project's approved deployment process.

## Collaboration

- Preserve each provider's independent session; do not pretend agents share a
  terminal or context window.
- Use the durable room history and structured handoffs as shared memory.
- Keep facts, inferences, and unknowns distinct.
- On capacity exhaustion, hand off the original instruction, current evidence,
  unresolved questions, changed files, verification performed, and next action.
- An agent continuing a handoff inherits the same permission boundary. Failover
  never creates new implementation authority.

## Engineering quality

- Preserve existing conventions and unrelated user changes.
- Use descriptive names, small focused changes, and tests for behavior changes.
- JavaScript uses ESM, 2-space indentation, and Node.js built-ins where practical.
- Python contributions follow PEP 8 and use type annotations where practical.
- Finish each feature with syntax checks, focused tests, regression tests, and a
  proof record under `docs/verification/`. Do not commit a failing stage.
- Never include tokens, credentials, private agent output, or local task history
  in commits.

## Required handoff

End unfinished work with:

```text
Status:
Original assignment:
Established facts:
Inferences:
Unknowns:
Files changed:
Verification:
Risks:
Next action:
Owner decision needed:
```
