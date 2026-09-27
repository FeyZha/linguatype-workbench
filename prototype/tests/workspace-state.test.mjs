import assert from 'node:assert/strict';
import test from 'node:test';
import { createEssayDocument, loadWorkspace, WORKSPACE_KEY, LEGACY_DRAFT_KEY, addHelpExposure, removeAssetHelp, isPersistedWorkspace } from '../app/workspace-state.ts';
import { HELP_VERSION } from '../app/help-package.ts';

test('restores edited demo and custom essays without resetting cards or resurrecting deleted demos', () => {
  const now = '2026-09-10T00:00:00.000Z';
  const card = { cardId: 'c1', status: 'ready', revealedScaffolds: ['0:s1'], feedback: 'helpful' };
  const documents = ['initial', 'custom'].map((id) => ({
    ...createEssayDocument(id, now, { taskPrompt: 'A saved topic', essay: 'My own revised text.' }),
    supportCards: [card], archivedCards: [{ ...card, archivedAt: now }], activeCardId: 'c1',
  }));
  const workspace = { version: 2, documents, activeDocumentId: 'custom', savedAt: now };
  for (const release of [null, 'old-demo-release']) {
    const values = new Map([[WORKSPACE_KEY, JSON.stringify(workspace)], ['linguatype:demo-library-release', release]]);
    const storage = { getItem: (key) => values.get(key) ?? null };
    assert.deepEqual(loadWorkspace(storage, 'unused', now), JSON.parse(JSON.stringify(workspace)));
    assert.equal(values.get(WORKSPACE_KEY), JSON.stringify(workspace));
  }
  const draft = { version: 1, taskPrompt: 'Old topic', essay: 'Legacy text.', supportCards: [{ ...card, status: 'loading' }], archivedCards: [], activeCardId: 'c1', savedAt: now };
  const restored = loadWorkspace({ getItem: (key) => key === LEGACY_DRAFT_KEY ? JSON.stringify(draft) : null }, 'migrated', now);
  assert.equal(restored.documents[0].essay, draft.essay);
  assert.equal(restored.documents[0].supportCards[0].status, 'error');
  assert.deepEqual(restored.documents[0].supportCards[0].revealedScaffolds, ['0:s1']);
  assert.equal(loadWorkspace({ getItem: () => null }, 'unused', now), null);
  assert.throws(() => loadWorkspace({ getItem: () => '{broken' }, 'unused', now));
});

test('help exposure records actual content once, preserves old attempts and removes deleted references', () => {
  const now = '2026-09-10T00:00:00.000Z';
  const item = { itemId: 'i1', sourceZh: '缓解拥堵', kind: 'saved', assetId: 'a1', assetRevision: 1, meaningZh: '缓解拥堵', expression: 'ease congestion', conditions: '', sourceQuote: 'Buses ease congestion.' };
  const card = { cardId: 'c1', requestToken: 'r1', status: 'ready', revealedScaffolds: [], helpPackage: { version: HELP_VERSION, items: [item], meta: { generationCalls: 0 } } };
  let document = { ...createEssayDocument('doc1', now, { taskPrompt: 'Transport', essay: 'Buses can 缓解拥堵.' }), supportCards: [card] };
  const event = { requestToken: 'r1', itemId: 'i1', kind: 'saved_chinese', content: '缓解拥堵', shownAt: now, assetId: 'a1', assetRevision: 1 };
  document = addHelpExposure(document, 'c1', event);
  document = addHelpExposure(document, 'c1', event);
  assert.equal(document.supportCards[0].helpExposures.length, 1);
  assert.equal(document.supportCards[0].helpExposures[0].essayBefore, document.essay);
  assert(!JSON.stringify(document.supportCards[0].helpExposures).includes('ease congestion'));
  document = { ...document, essay: 'Buses can ease congestion.', supportCards: [{ ...document.supportCards[0], requestToken: 'r2' }] };
  document = addHelpExposure(document, 'c1', { ...event, kind: 'saved_english', content: 'ease congestion' });
  assert.equal(document.supportCards[0].helpExposures.length, 1);
  document = addHelpExposure(document, 'c1', { ...event, requestToken: 'r2', kind: 'saved_english', content: 'ease congestion' });
  assert.equal(document.supportCards[0].helpExposures[1].essayBefore, document.essay);
  const workspace = { version: 2, documents: [document], activeDocumentId: 'doc1', savedAt: now };
  assert(isPersistedWorkspace(workspace));
  assert(isPersistedWorkspace(JSON.parse(JSON.stringify(workspace))));
  const corrupt = structuredClone(workspace); corrupt.documents[0].supportCards[0].helpExposures[0].sequence = 0;
  assert(!isPersistedWorkspace(corrupt));
  const cleared = removeAssetHelp({ ...document, archivedCards: [{ ...document.supportCards[0], archivedAt: now }] }, 'a1');
  assert.equal(cleared.supportCards[0].helpPackage, null);
  assert.equal(cleared.supportCards[0].helpExposures.length, 0);
  assert.equal(cleared.archivedCards[0].helpPackage, null);
  assert.equal(cleared.essay, document.essay);
});

test('validates legacy favorites only for migration compatibility', () => {
  const now = '2026-09-11T10:00:00.000Z';
  const input = { expression: 'reduce traffic congestion', meaningZh: '缓解交通拥堵', sourceSentence: 'Affordable buses can 缓解交通拥堵.', sourceDocumentId: 'doc1', sourcePrompt: 'Should public transport be free?' };
  const added = [{ ...input, favoriteId: 'favorite-1', createdAt: now }];
  const workspace = { version: 2, documents: [createEssayDocument('doc1', now)], activeDocumentId: 'doc1', favoriteExpressions: added, savedAt: now };
  assert.equal(isPersistedWorkspace(workspace), true);
  assert.equal(isPersistedWorkspace({ ...workspace, favoriteExpressions: [{ ...added[0], sourceSentence: '' }] }), false);
});
