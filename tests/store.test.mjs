import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageETag } from '../lib/store.mjs';

test('download validators retain the exact storage version for conditional writes', () => {
  assert.equal(storageETag('W/"9e81b96ae3f3978af6fe891bb95d0f68"'), '"9e81b96ae3f3978af6fe891bb95d0f68"');
  assert.equal(storageETag('"another-version"'), '"another-version"');
  assert.equal(storageETag(undefined), undefined);
});
