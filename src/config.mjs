import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadConfig(root = projectRoot) {
  const localPath = join(root, 'config.json');
  const examplePath = join(root, 'config.example.json');
  const selectedPath = existsSync(localPath) ? localPath : examplePath;

  return JSON.parse(readFileSync(selectedPath, 'utf8'));
}
