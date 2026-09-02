const requiredCapabilities = [
  'independentSessions',
  'nativeHooks',
  'nativeSkills',
  'nativeWorktrees',
  'projectRules',
  'streamingOutput'
];

export function validateAdapter(adapter) {
  const errors = [];

  if (!adapter?.id) errors.push('id is required');
  if (!adapter?.displayName) errors.push('displayName is required');
  if (!adapter?.commands?.length) errors.push('at least one command is required');
  if (!adapter?.authentication?.status) {
    errors.push('authentication status command is required');
  }
  if (!adapter?.authentication?.login?.length) {
    errors.push('at least one authentication method is required');
  }
  if (!adapter?.session?.startArguments?.length) {
    errors.push('session start arguments are required');
  }
  if (!adapter?.session?.resumeArguments?.length) {
    errors.push('session resume arguments are required');
  }
  if (!adapter?.permissions?.investigate?.length) {
    errors.push('investigation permissions are required');
  }
  if (!adapter?.permissions?.implement?.length) {
    errors.push('implementation permissions are required');
  }

  for (const capability of requiredCapabilities) {
    if (typeof adapter?.capabilities?.[capability] !== 'boolean') {
      errors.push(`capability ${capability} must be boolean`);
    }
  }

  return errors;
}
