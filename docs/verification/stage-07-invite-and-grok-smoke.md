# Stage 7 verification: invite flow and Grok smoke test

Date: 2026-09-03

## Claim

An installed provider can be invited, authenticated, explicitly enabled, routed
by mention, and disabled. Windows-native executables and PowerShell launchers are
resolved without treating owner prompts as shell commands.

## Evidence

- `npm run check`: passed.
- `npm test`: 30 tests passed, 0 failed, repeated three consecutive times.
- `git diff --check`: passed.

The focused tests demonstrate:

- an invited Grok member remains unroutable before authentication;
- connected members can be explicitly enabled and receive `@grok` assignments;
- disabled members stop receiving assignments without losing history;
- legacy aliases such as `@chatgpt` remain routable;
- Windows PowerShell provider launchers are discovered and invoked without shell
  interpolation;
- provider login failures are detected even when a probe exits with code zero;
- structured provider errors are normalized without ANSI diagnostic noise.

## Live proof

The installed `grok` executable was discovered at its user-local installation.
An initial probe exposed a false positive and unreadable credential path; after
the parser was corrected and read-only access to the credential directory was
granted, the probe returned `login_required`. A model turn was not run after
that result, so no additional token-consuming smoke call was attempted.

## Safety

The live action was limited to Grok's model/authentication status probe. No login
was initiated, no credential content was printed or stored, no product workspace
was changed, and no EC2, Vercel, or production operation was attempted.
