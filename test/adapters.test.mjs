import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adapterCatalog,
  getAdapter,
  publicAdapterCatalog
} from '../src/adapters/catalog.mjs';
import { validateAdapter } from '../src/adapters/validate.mjs';

test('built-in adapter definitions satisfy the capability protocol', () => {
  for (const adapter of Object.values(adapterCatalog)) {
    assert.deepEqual(validateAdapter(adapter), [], adapter.id);
  }
});

test('catalog includes the three locally demonstrated provider families', () => {
  assert.ok(getAdapter('claude'));
  assert.ok(getAdapter('codex'));
  assert.ok(getAdapter('grok'));
});

test('public catalog omits executable arguments and login commands', () => {
  const publicCatalog = publicAdapterCatalog();
  const serialized = JSON.stringify(publicCatalog);

  assert.equal(serialized.includes('resumeArguments'), false);
  assert.equal(serialized.includes('--device-auth'), false);
  assert.deepEqual(
    publicCatalog.find((adapter) => adapter.id === 'grok')
      .authentication.loginMethods.map((method) => method.id),
    ['oauth', 'device']
  );
});
