import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkspaceBackup, replaceWorkspace } from '../app/workspace-data.ts';
import { loadWorkspace, WORKSPACE_KEY } from '../app/workspace-state.ts';

test('existing materials and research survive load, export and import', () => {
  const original = JSON.parse(readFileSync(new URL('../app/mvp-demo.json', import.meta.url), 'utf8'));
  const memory = new Map([[WORKSPACE_KEY, JSON.stringify(original)]]);
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  const loaded = loadWorkspace(storage, 'unused', new Date().toISOString());
  assert.deepEqual(loaded.documents, original.documents);
  assert.deepEqual(loaded.assetLibrary, original.assetLibrary);
  const imported = readWorkspaceBackup(JSON.stringify(loaded));
  replaceWorkspace(storage, storage, imported, 'new-epoch');
  const restored = loadWorkspace(storage, 'unused', new Date().toISOString());
  assert.deepEqual(restored.documents, original.documents);
  assert.deepEqual(restored.assetLibrary, original.assetLibrary);
  const completion = restored.documents.find(d => d.documentId === 'mvp-finished-city').completions[0];
  assert.equal([...completion.usageReviews, ...completion.ideaUsageReviews, ...completion.reasonUsageReviews].length, 14);
  assert.equal(restored.assetLibrary.ideas.length, 6);
  assert.equal(restored.assetLibrary.reasons.length, 2);
});
