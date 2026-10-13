import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore, createMemoryStore } from './session-store.mjs';

test('memory and file stores round-trip, update, and sweep', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudcall-store-'));
  const stores = [createMemoryStore(), createFileStore(join(directory, 'records.json'))];
  try {
    for (const store of stores) {
      assert.equal(store.ready(), true);
      store.set('a', { expires: 10 });
      assert.deepEqual(store.get('a'), { expires: 10 });
      const updated = store.update('a', (current) => ({
        ...current,
        expires: current.expires + 1,
      }));
      assert.equal(updated.expires, 11);
      store.set('b', { expires: 1 });
      store.sweep((value) => value.expires <= 1);
      assert.equal(store.get('b'), undefined);
      assert.equal(store.size(), 1);
      store.delete('a');
      assert.equal(store.size(), 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
