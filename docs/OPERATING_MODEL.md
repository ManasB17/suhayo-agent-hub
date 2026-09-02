# Local agent organization

## Roles

The owner defines goals, assigns roles, approves exact implementation scope, and
makes final decisions. Agents are local provider sessions invited as room
members. Their default responsibilities are configurable; typical roles are
investigator, architect, implementation engineer, reviewer, and verifier.

## Workflow

1. The owner posts one or more quoted `@member` assignments.
2. Each member works in its own provider session under the current task gate.
3. Investigation produces a proposal, not an implementation.
4. The owner records or declines an exact implementation scope.
5. Approved implementation occurs in an isolated branch or worktree.
6. A different agent reviews the implementation.
7. Regression evidence is recorded before completion.

## Continuity

The event log is shared organizational memory, not a shared model context. Each
provider session remains independent. If capacity is exhausted, Agent Hub writes
a structured handoff and may route the same assignment to one enabled member
with the same role. The continuation retains the original approval boundary and
cannot expand its own scope.

## Authentication

Agent Hub never owns provider credentials. It invokes the installed provider's
native status and login commands. Invited members remain disabled until their
provider reports a connected state and the owner explicitly enables them.

## Deployment boundary

Agent Hub has no EC2, SSH, Vercel, or production deployment adapter. Repository
work and deployment are separate approvals. Direct writes to EC2 are prohibited.
