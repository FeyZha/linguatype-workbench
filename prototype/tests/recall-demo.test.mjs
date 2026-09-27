import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecallDemoWorkspace, RECALL_DEMO_CASES } from '../app/demo-recall.ts';
import { isRecallDemoMode, workspaceStorageKey } from '../app/workspace-mode.ts';
import { isPersistedWorkspace } from '../app/workspace-state.ts';
import { readArgumentAssetRecallInput, readArgumentAssetRecallResult, ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from '../app/argument-asset-recall.ts';

test('recall experience has three isolated empty drafts and a traceable existing thought', () => {
  const demo = createRecallDemoWorkspace();
  assert(isPersistedWorkspace(demo));
  assert.equal(demo.documents.length, 4);
  assert.deepEqual(RECALL_DEMO_CASES.map(item => item.expectedCount), [1, 0, 0]);
  assert.equal(demo.argumentAssets.length, 1);
  assert.equal(demo.argumentAssetUsages.length, 0);
  const asset = demo.argumentAssets[0];
  assert.equal(asset.kind, 'thought');
  assert.equal(asset.status, 'active');
  assert.equal(asset.usageCount, 0);
  for (const source of asset.sources) {
    const document = demo.documents.find(item => item.documentId === source.documentId);
    const pack = demo.topicAssetPacks.find(item => item.sourceDocumentId === source.documentId);
    assert(document.essay.includes(source.quote));
    assert.equal(document.essay, pack.sourceEssaySnapshot);
    assert.equal(source.revisionId, pack.completion.versionId);
  }
  for (const item of RECALL_DEMO_CASES) {
    const document = demo.documents.find(d => d.documentId === item.documentId);
    assert.equal(document.essay, '');
    assert.equal(document.taskPrompt, item.taskPrompt);
    assert(!asset.sources.some(source => source.documentId === document.documentId));
    const input = readArgumentAssetRecallInput({ taskPrompt: document.taskPrompt, currentDraft: '', assets: demo.argumentAssets });
    assert.deepEqual(Object.keys(input).sort(), ['assets', 'currentDraft', 'taskPrompt']);
    assert(!JSON.stringify(input).includes(item.explanation));
    const checked = readArgumentAssetRecallResult({ version: 3, matches: item.expectedCount ? [{ assetId: asset.assetId }] : [], meta: { model: 'synthetic-contract-check', promptVersion: ARGUMENT_ASSET_RECALL_PROMPT_VERSION, callCount: 1, latencyMs: 0 } }, demo.argumentAssets);
    assert.equal(checked.matches.length, item.expectedCount);
  }
  demo.argumentAssets[0].thought = 'Edited only in this demo instance';
  assert.notEqual(createRecallDemoWorkspace().argumentAssets[0].thought, demo.argumentAssets[0].thought);
  for (const key of ['linguatype:workspace:v2', 'linguatype:draft:v1', 'linguatype:conflict:v2', 'linguatype:profile-epoch']) {
    const isolated = workspaceStorageKey(key, '?demo=recall');
    for (const search of ['', '?demo=0', '?demo=learner']) assert.notEqual(isolated, workspaceStorageKey(key, search));
  }
  assert(isRecallDemoMode('?demo=recall'));
  assert(!isRecallDemoMode('?demo=learner'));
});
