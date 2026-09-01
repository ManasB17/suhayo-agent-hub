# Contributing

Thank you for considering a contribution to Suhayo Agent Hub.

## Before you start

- Search existing issues before creating a new one.
- Propose significant behavior or safety changes in an issue first.
- Never include credentials, private prompts, customer data, or local task history in an issue or pull request.

## Pull requests

- Keep each pull request focused on one concern.
- Describe the behavior change, safety implications, and how it was tested.
- Preserve the owner approval gate and local-first default unless the change explicitly improves those guarantees.
- Run `npm run check` and `npm test` before requesting review.
- Use clear, descriptive names and avoid unrelated formatting changes.

## Code style

- Use modern ESM JavaScript and 2-space indentation.
- Prefer descriptive names over abbreviations.
- Keep side effects at the edges of the application.
- Add tests for behavior changes where feasible.
- If Python is introduced, follow PEP 8, use type annotations where practical, and include tests.

## Reporting bugs

Include the operating system, Node.js version, agent command, expected behavior, actual behavior, and steps to reproduce. Remove project-sensitive content before submitting.
