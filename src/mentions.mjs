export class MentionSyntaxError extends Error {}

function isNameCharacter(character) {
  return /[A-Za-z0-9_-]/.test(character ?? '');
}

function readMention(text, start) {
  let cursor = start + 1;
  if (!/[A-Za-z]/.test(text[cursor] ?? '')) return null;

  while (isNameCharacter(text[cursor])) cursor += 1;
  return {
    name: text.slice(start + 1, cursor).toLowerCase(),
    end: cursor
  };
}

function readQuotedInstruction(text, start, quote) {
  let cursor = start + 1;
  let value = '';

  while (cursor < text.length) {
    const character = text[cursor];
    if (character === '\\' && cursor + 1 < text.length) {
      value += text[cursor + 1];
      cursor += 2;
      continue;
    }
    if (character === quote) {
      return { instruction: value.trim(), end: cursor + 1 };
    }
    value += character;
    cursor += 1;
  }

  throw new MentionSyntaxError(`Missing closing ${quote} for agent assignment.`);
}

function nextMentionIndex(text, start) {
  for (let cursor = start; cursor < text.length; cursor += 1) {
    if (text[cursor] === '@' && readMention(text, cursor)) return cursor;
  }
  return -1;
}

export function parseAssignments(text) {
  const assignments = [];
  let cursor = 0;

  while (cursor < text.length) {
    const mentionStart = nextMentionIndex(text, cursor);
    if (mentionStart === -1) break;

    const mention = readMention(text, mentionStart);
    cursor = mention.end;
    while (/\s/.test(text[cursor] ?? '')) cursor += 1;

    const quote = text[cursor];
    if (quote === '"' || quote === '`') {
      const quoted = readQuotedInstruction(text, cursor, quote);
      if (!quoted.instruction) {
        throw new MentionSyntaxError(`@${mention.name} has an empty assignment.`);
      }
      assignments.push({ agent: mention.name, instruction: quoted.instruction });
      cursor = quoted.end;
      continue;
    }

    const followingMention = nextMentionIndex(text, cursor);
    if (followingMention !== -1) {
      throw new MentionSyntaxError(
        'Use quotes or backticks around every assignment when mentioning multiple agents.'
      );
    }

    const instruction = text.slice(cursor).trim();
    if (!instruction) {
      throw new MentionSyntaxError(`@${mention.name} has an empty assignment.`);
    }
    assignments.push({ agent: mention.name, instruction });
    break;
  }

  return assignments;
}

export function buildMemberRegistry(agents = {}) {
  const members = new Map();

  for (const [name, configuration] of Object.entries(agents)) {
    const member = {
      name,
      role: configuration.role ?? 'member',
      aliases: configuration.aliases ?? [],
      configuration
    };
    members.set(name.toLowerCase(), member);
    for (const alias of member.aliases) {
      members.set(alias.toLowerCase(), member);
    }
  }

  return members;
}

export function resolveAssignments(assignments, agents = {}) {
  const registry = buildMemberRegistry(agents);
  const resolved = [];

  for (const assignment of assignments) {
    if (assignment.agent === 'both') {
      for (const [name, configuration] of Object.entries(agents)) {
        if (configuration.enabled) {
          resolved.push({ name, configuration, instruction: assignment.instruction });
        }
      }
      continue;
    }

    const member = registry.get(assignment.agent);
    if (!member) {
      resolved.push({
        name: assignment.agent,
        configuration: null,
        instruction: assignment.instruction
      });
      continue;
    }

    resolved.push({
      name: member.name,
      configuration: member.configuration,
      instruction: assignment.instruction
    });
  }

  return resolved;
}
