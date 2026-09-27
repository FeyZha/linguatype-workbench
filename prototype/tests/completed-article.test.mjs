import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletedVersion, isCompletedVersions, recoverCompletedVersions } from '../app/article-completion.ts';
import { createEssayDocument, isPersistedWorkspace, recoverWorkspace } from '../app/workspace-state.ts';
import { readWorkspaceBackup } from '../app/workspace-data.ts';
import { DEPOSIT_PROMPT_VERSION, isTopicAssetPacks, saveTopicAssetPack, topicAssetItemCount } from '../app/topic-assets.ts';

const now = '2026-09-12T04:00:00.000Z';
const source = {
  documentId: 'essay-1', sourceTitle: 'Public transport', taskPrompt: 'Should governments invest in public transport?',
  snapshot: 'Reliable bus services can reduce dependence on private cars by making daily journeys more convenient.',
};
const candidate = {
  topicTags: ['public transport'],
  viewpoint: null,
  reasons: [{ summaryZh: '可靠且方便的公共交通可以减少对私家车的依赖。', sourceQuote: source.snapshot }],
  exampleIdea: null,
  collocations: [{ expression: 'reduce dependence on private cars', meaningZh: '减少对私家车的依赖', sourceQuote: source.snapshot }],
};
const meta = { model: 'synthetic-test', promptVersion: DEPOSIT_PROMPT_VERSION };
const emptyCandidate = { topicTags: [], viewpoint: null, reasons: [], exampleIdea: null, collocations: [] };
const saveSource = (snapshot = source.snapshot, completion) => ({ documentId: source.documentId, sourceTitle: source.sourceTitle, taskPrompt: source.taskPrompt, essay: snapshot, ...(completion ? { completion } : {}) });
const workspaceWith = records => ({
  version: 2, activeDocumentId: source.documentId, savedAt: now,
  documents: [{ ...createEssayDocument(source.documentId, now, { essay: source.snapshot, taskPrompt: source.taskPrompt }), ...(records ? { completedVersions: records } : {}) }],
});

test('confirmation stores the exact declared version without inventing a save reason', async () => {
  const record = await createCompletedVersion(source, 'complete-1', now, '');
  assert.equal(record.status, 'pending');
  assert.equal(record.snapshot, source.snapshot);
  assert.equal(record.saveReason, '');
  assert.equal(record.candidate, null);
  assert.equal(isCompletedVersions([record]), true);
  const old = workspaceWith();
  assert.equal(isPersistedWorkspace(old), true);
  assert.equal('completedVersions' in recoverWorkspace(old).documents[0], false);
  for (const invalid of [
    { ...record, confirmedAt: 'yesterday-ish' }, { ...record, saveReason: 'x'.repeat(301) },
    { ...record, snapshot: 'x'.repeat(20001) }, { ...record, taskPrompt: '' },
    { ...record, essayHash: 'not-a-hash' }, { ...record, requestId: 7 },
    { ...record, status: 'saved' }, { ...record, meta: { model: '', promptVersion: 'test' } },
  ]) assert.equal(isCompletedVersions([invalid]), false);
  assert.equal(isCompletedVersions([record, record]), false);
  assert.equal(isCompletedVersions(Array.from({ length: 1001 }, (_, i) => ({ ...record, id: String(i) }))), false);
  assert.equal(isPersistedWorkspace(workspaceWith([{ ...record, documentId: 'another-essay' }])), false);
  await assert.rejects(createCompletedVersion({ ...source, snapshot: '' }, 'id', now, ''), /INVALID_COMPLETION/);
});

test('unfinished edits and all-deleted candidates survive refresh, but invented sources do not', async () => {
  const record = await createCompletedVersion(source, 'complete-1', now, '我想留下这段理由。');
  const edited = { ...candidate, reasons: [{ ...candidate.reasons[0], summaryZh: '' }], collocations: [{ ...candidate.collocations[0], meaningZh: 'jian' }] };
  const ready = { ...record, status: 'ready', candidate: edited, meta };
  assert.equal(isCompletedVersions([ready]), true);
  assert.deepEqual(readWorkspaceBackup(JSON.stringify(workspaceWith([ready]))).documents[0].completedVersions[0].candidate, edited);
  const interrupted = { ...ready, status: 'loading', requestId: 'request-1' };
  const recovered = recoverCompletedVersions([interrupted])[0];
  assert.equal(recovered.status, 'error');
  assert.equal(recovered.requestId, null);
  assert.equal(recovered.snapshot, source.snapshot);
  assert.deepEqual(recovered.candidate, edited);
  assert.deepEqual(recoverWorkspace(workspaceWith([interrupted])).documents[0].completedVersions, [recovered]);
  assert.equal(isCompletedVersions([recovered]), true);
  assert.equal(isCompletedVersions([{ ...ready, candidate: emptyCandidate }]), true);
  assert.deepEqual(readWorkspaceBackup(JSON.stringify(workspaceWith([{ ...ready, candidate: emptyCandidate }]))).documents[0].completedVersions[0].candidate, emptyCandidate);
  for (const invalid of [
    { ...edited, reasons: [{ summaryZh: '', sourceQuote: 'An invented sentence.' }] },
    { ...edited, collocations: [{ ...edited.collocations[0], expression: 'invented source expression' }] },
    { ...edited, collocations: [{ ...edited.collocations[0], meaningZh: 'x'.repeat(301) }] },
    { ...edited, reasons: Array(3).fill(candidate.reasons[0]) },
  ]) assert.equal(isCompletedVersions([{ ...ready, candidate: invalid }]), false);
  await assert.rejects(saveTopicAssetPack([], saveSource(), edited, meta, 'pack', now), /INVALID_RESPONSE/);
});

test('new revisions carry their own confirmation; repeated saves never fabricate older confirmation', async () => {
  const old = await saveTopicAssetPack([], saveSource(), candidate, meta, 'pack-1', now);
  assert.equal('completion' in old.pack, false);
  const receipt = { versionId: 'complete-1', confirmedAt: now, saveReason: '我想留下这段理由。' };
  const duplicate = await saveTopicAssetPack(old.packs, saveSource(source.snapshot, receipt), candidate, meta, 'pack-2', now);
  assert.equal(duplicate.outcome, 'unchanged');
  assert.strictEqual(duplicate.packs, old.packs);
  assert.equal('completion' in duplicate.pack, false);

  const secondEssay = `${source.snapshot} Frequent buses also help shift workers travel home.`;
  const second = await saveTopicAssetPack(old.packs, saveSource(secondEssay, receipt), candidate, meta, 'pack-2', now);
  assert.equal(second.pack.revision, 2);
  assert.deepEqual(second.pack.completion, receipt);
  assert.equal('completion' in second.pack.previousRevisions[0], false);
  const receipt3 = { versionId: 'complete-2', confirmedAt: now, saveReason: '' };
  const third = await saveTopicAssetPack(second.packs, saveSource(`${secondEssay} More routes can reach outer suburbs.`, receipt3), candidate, meta, 'pack-3', now);
  assert.deepEqual(third.pack.previousRevisions[1].completion, receipt);
  assert.deepEqual(third.pack.completion, receipt3);
  assert.equal(isTopicAssetPacks(third.packs), true);
  assert.equal(isTopicAssetPacks([{ ...third.pack, completion: { ...receipt3, confirmedAt: 'invalid' } }]), false);
  assert.equal(old.pack.sourceEssaySnapshot, source.snapshot);
});

test('new empty or ungrounded packs are refused while old empty packs remain readable', async () => {
  assert.equal(topicAssetItemCount(candidate), 2);
  assert.equal(topicAssetItemCount(emptyCandidate), 0);
  await assert.rejects(saveTopicAssetPack([], saveSource(), emptyCandidate, meta, 'empty', now), /EMPTY_CANDIDATE/);
  const receipt = { versionId: 'complete-1', confirmedAt: now, saveReason: '' };
  await assert.rejects(saveTopicAssetPack([], saveSource(source.snapshot, receipt), { ...candidate, exampleIdea: { summaryZh: '没有来源的例子。', sourceQuote: null } }, meta, 'bad', now), /INVALID_RESPONSE/);
  const old = await saveTopicAssetPack([], saveSource(), candidate, meta, 'pack', now);
  const oldEmpty = { ...old.pack, ...emptyCandidate };
  assert.equal(isTopicAssetPacks([oldEmpty]), true);
  const result = await saveTopicAssetPack([oldEmpty], saveSource(source.snapshot, receipt), emptyCandidate, meta, 'new', now);
  assert.equal(result.outcome, 'unchanged');
  assert.equal('completion' in result.pack, false);
});

test('backup import preserves old favorites, packs and pending completion edits together', async () => {
  const old = await saveTopicAssetPack([], saveSource(), candidate, meta, 'pack', now);
  const record = await createCompletedVersion(source, 'complete-1', now, '');
  const workspace = {
    ...workspaceWith([{ ...record, status: 'ready', candidate, meta }]),
    topicAssetPacks: old.packs,
    favoriteExpressions: [{ favoriteId: 'favorite', expression: candidate.collocations[0].expression, meaningZh: '减少依赖', sourceSentence: source.snapshot, sourceDocumentId: source.documentId, sourcePrompt: source.taskPrompt, createdAt: now }],
  };
  const restored = readWorkspaceBackup(JSON.stringify(workspace));
  assert.deepEqual(restored, { ...JSON.parse(JSON.stringify(workspace)), assetLibrary: undefined, starterMaterialsLoaded: false });
  assert.equal('completion' in restored.topicAssetPacks[0], false);
  const bad = structuredClone(workspace);
  bad.documents[0].completedVersions[0].candidate.reasons[0].sourceQuote = 'This is not the confirmed essay.';
  assert.throws(() => readWorkspaceBackup(JSON.stringify(bad)), /INVALID_BACKUP/);
});
