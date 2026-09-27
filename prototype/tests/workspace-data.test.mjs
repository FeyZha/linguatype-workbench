import { setQualityAttempt, isAssetLibrary } from '../app/language-assets.ts';
import { recoverWorkspace } from '../app/workspace-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkspaceBackup, prepareEmptyWorkspace, replaceWorkspace, profileEpoch, CONFLICT_KEY, SESSION_EPOCH_KEY } from '../app/workspace-data.ts';
import { WORKSPACE_KEY, LEGACY_DRAFT_KEY } from '../app/workspace-state.ts';
const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; };
test('backup validation preserves actual records, rejects corruption and leaves old data intact on quota failure', () => {
  const receipt = JSON.parse(readFileSync(new URL('../../evals/expression-scaffold/runs/vnext-a3-integration-20260911/related.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')).data.result.workspace;
  const pending = structuredClone(receipt); const a = pending.assetLibrary.reasons[0]; a.quality = 'unreviewed'; delete a.qualityReview;
  pending.assetLibrary = setQualityAttempt(pending.assetLibrary, a.assetId, a.revision, { attemptId: 'quality-attempt', revision: a.revision, status: 'loading' });
  assert.equal(isAssetLibrary(pending.assetLibrary), true);
  const interrupted = recoverWorkspace(pending); assert.equal(interrupted.assetLibrary.reasons[0].qualityAttempt.errorKind, 'interrupted');
  const late = setQualityAttempt(pending.assetLibrary, a.assetId, a.revision, { attemptId: 'other', revision: a.revision, status: 'error', errorKind: 'request_failed' }, 'stale');
  assert.deepEqual(late, pending.assetLibrary);
  const restored = readWorkspaceBackup(JSON.stringify({ ...receipt, savedWorkspaceSnapshot: 'private extra snapshot' }));
  assert.deepEqual(restored.documents, receipt.documents); assert.equal('savedWorkspaceSnapshot' in restored, false);
  for (const mutate of [v => { v.documents[0].essay = {}; }, v => { v.documents[0].supportCards = null; }, v => { v.documents.push(v.documents[0]); }, v => { v.activeDocumentId = 'missing'; }, v => { v.documents[0].completions[0].reasonUsageReviews[0].relations.pop(); }, v => { v.documents[0].supportCards = [{ cardId: 'bad' }]; }]) {
    const bad = structuredClone(receipt); mutate(bad); assert.throws(() => readWorkspaceBackup(JSON.stringify(bad)));
  }
  const local = storage(), session = storage(); local.setItem(WORKSPACE_KEY, JSON.stringify(receipt)); local.setItem(LEGACY_DRAFT_KEY, 'legacy private text'); session.setItem(CONFLICT_KEY, 'conflict private text');
  const before = local.getItem(WORKSPACE_KEY);
  assert.throws(() => replaceWorkspace({ ...local, setItem: () => { throw new Error('quota'); } }, session, restored, 'new-epoch'));
  assert.equal(local.getItem(WORKSPACE_KEY), before); assert.equal(session.getItem(CONFLICT_KEY), 'conflict private text');
  const empty = prepareEmptyWorkspace('blank', '2026-09-11T00:00:00Z'); replaceWorkspace(local, session, empty, 'cleared');
  assert.equal(profileEpoch(local.getItem(WORKSPACE_KEY)), 'cleared'); assert.notEqual(profileEpoch(before), 'cleared');
  assert.equal(local.getItem(LEGACY_DRAFT_KEY), null); assert.equal(session.getItem(CONFLICT_KEY), null); assert.equal(session.getItem(SESSION_EPOCH_KEY), 'cleared');
  const blank = readWorkspaceBackup(local.getItem(WORKSPACE_KEY)); assert.equal(blank.documents[0].essay, ''); assert.equal(blank.documents[0].writingTrace.events.length, 0); assert.equal((blank.assetLibrary.reasons ?? []).length, 0);
  session.setItem(CONFLICT_KEY, 'old conflict');
  replaceWorkspace(local, { ...session, setItem: () => { throw new Error('session quota'); } }, empty, 'session-full');
  assert.equal(profileEpoch(local.getItem(WORKSPACE_KEY)), 'session-full'); assert.equal(session.getItem(CONFLICT_KEY), null);
  replaceWorkspace(local, session, restored, 'restored'); assert.deepEqual(JSON.parse(local.getItem(WORKSPACE_KEY)).documents, receipt.documents);
});

