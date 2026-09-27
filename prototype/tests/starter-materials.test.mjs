import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addStarterMaterials } from '../app/starter-materials.ts';
import { readWorkspaceBackup, prepareEmptyWorkspace, replaceWorkspace } from '../app/workspace-data.ts';
import { WORKSPACE_KEY } from '../app/workspace-state.ts';

test('fills three personal libraries once, preserving text/history and respecting deletions and replacement', () => {
  const examples = readWorkspaceBackup(readFileSync(new URL('../app/mvp-demo.json', import.meta.url), 'utf8'));
  const old = prepareEmptyWorkspace('personal', new Date().toISOString());
  old.documents[0].essay = 'My own writing.';
  const filled = addStarterMaterials(old, examples);
  assert.deepEqual(filled.documents[0], old.documents[0]);
  assert.equal(filled.activeDocumentId, old.activeDocumentId);
  assert.deepEqual([filled.assetLibrary.assets.length, filled.assetLibrary.ideas.length, filled.assetLibrary.reasons.length], [6, 6, 2]);
  assert.equal(filled.documents.length, 3);
  assert.equal(readWorkspaceBackup(JSON.stringify(filled)).starterMaterialsLoaded, true);
  for (const a of [...filled.assetLibrary.assets, ...filled.assetLibrary.ideas, ...filled.assetLibrary.reasons]) {
    const source = filled.documents.find(d => d.documentId === a.sourceDocumentId)?.completions.find(c => c.completionId === a.sourceCompletionId);
    assert(source);
    for (const quote of a.nodes ? [...a.nodes, ...a.links].map(n => n.sourceQuote) : [a.sourceQuote]) assert(source.essay.includes(quote));
  }
  filled.assetLibrary.assets.pop();
  assert.equal(addStarterMaterials(filled, examples), filled);
  const memory = new Map();
  const storage = { setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  replaceWorkspace(storage, storage, old, 'replacement');
  const replaced = JSON.parse(memory.get(WORKSPACE_KEY));
  assert.equal(addStarterMaterials(replaced, examples).assetLibrary.assets.length, 0);
  const duplicate = addStarterMaterials({ ...examples, starterMaterialsLoaded: false }, examples);
  assert.equal(duplicate.documents.length, examples.documents.length);
  assert.equal(duplicate.assetLibrary.assets.length, 6);
});
