import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_PROMPT_VERSION, isFeedbackRuns, readFeedbackResult, textHash } from '../app/essay-feedback.ts';
import { DEPOSIT_PROMPT_VERSION, RECALL_PROMPT_VERSION, isTopicAssetPacks, readRecallResult, readTopicAssetCandidate, saveTopicAssetPack } from '../app/topic-assets.ts';

const essay = 'Governments should prioritize public transport investment. Reliable buses reduce traffic congestion because fewer commuters rely on private cars.';
const candidate = {
  topicTags: ['public transport', 'traffic congestion'],
  viewpoint: { textEn: 'Governments should prioritize public transport investment.', meaningZh: '政府应优先投资公共交通。', sourceQuote: 'Governments should prioritize public transport investment.' },
  reasons: [{ summaryZh: '可靠公交减少私家车使用，从而缓解拥堵。', sourceQuote: 'Reliable buses reduce traffic congestion because fewer commuters rely on private cars.' }],
  exampleIdea: null,
  collocations: [{ expression: 'reduce traffic congestion', meaningZh: '缓解交通拥堵', sourceQuote: 'Reliable buses reduce traffic congestion because fewer commuters rely on private cars.' }],
};

test('feedback stays grounded in its exact essay version', async () => {
  const result = readFeedbackResult({ summary: '理由还可以更具体。', suggestions: [{ criterion: 'task_response', type: 'reasoning', sourceQuote: 'Reliable buses reduce traffic congestion because fewer commuters rely on private cars.', problemZh: '因果说明较笼统。', directionZh: '说明哪些通勤者会改变出行方式。' }], meta: { model: 'test', promptVersion: FEEDBACK_PROMPT_VERSION, callCount: 1, latencyMs: 1 } }, essay);
  const run = { id: 'f1', documentId: 'd1', essayHash: await textHash(essay), essaySnapshot: essay, createdAt: '2026-09-12T00:00:00.000Z', status: 'ready', summary: result.summary, suggestions: result.suggestions, model: 'test', promptVersion: FEEDBACK_PROMPT_VERSION, error: null };
  assert.equal(isFeedbackRuns([run]), true);
  assert.throws(() => readFeedbackResult({ ...result, suggestions: [{ ...result.suggestions[0], sourceQuote: 'Invented sentence.' }] }, essay));
  assert.throws(() => readFeedbackResult({ ...result, suggestions: [{ ...result.suggestions[0], criterion: undefined }] }, essay));
  assert.doesNotThrow(() => readFeedbackResult({ ...result, suggestions: [{ ...result.suggestions[0], criterion: undefined }], meta: { ...result.meta, promptVersion: 'essay-feedback-v5-material-issues' } }, essay, 'essay-feedback-v5-material-issues'));
});

test('topic pack accepts one reason and refuses invented provenance', async () => {
  assert.deepEqual(readTopicAssetCandidate(candidate, essay), candidate);
  assert.throws(() => readTopicAssetCandidate({ ...candidate, reasons: [...candidate.reasons, { summaryZh: '不存在的第二理由。', sourceQuote: 'This was never written.' }] }, essay));
  const first = await saveTopicAssetPack([], { documentId: 'd1', sourceTitle: 'Transport', taskPrompt: 'Should governments invest in public transport?', essay }, candidate, { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION }, 'p1', '2026-09-12T00:00:00.000Z');
  const duplicate = await saveTopicAssetPack(first.packs, { documentId: 'd1', sourceTitle: 'Transport', taskPrompt: 'Should governments invest in public transport?', essay }, candidate, { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION }, 'p2', '2026-09-12T00:01:00.000Z');
  assert.equal(duplicate.outcome, 'unchanged');
  const changedEssay = `${essay} Metro expansion gives low-income residents better access to jobs.`;
  const changedCandidate = { ...candidate, reasons: [...candidate.reasons, { summaryZh: '公共交通提高低收入居民的就业可达性。', sourceQuote: 'Metro expansion gives low-income residents better access to jobs.' }] };
  const updated = await saveTopicAssetPack(first.packs, { documentId: 'd1', sourceTitle: 'Transport', taskPrompt: 'Should governments invest in public transport?', essay: changedEssay }, changedCandidate, { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION }, 'p2', '2026-09-12T00:02:00.000Z');
  assert.equal(updated.pack.revision, 2);
  assert.equal(updated.pack.previousRevisions.length, 1);
  assert.equal(isTopicAssetPacks(updated.packs), true);
});

test('recall accepts only existing pack ids and permits an empty result', async () => {
  const saved = await saveTopicAssetPack([], { documentId: 'd1', sourceTitle: 'Transport', taskPrompt: 'Should governments invest in public transport?', essay }, candidate, { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION }, 'p1', '2026-09-12T00:00:00.000Z');
  const meta = { model: 'test', promptVersion: RECALL_PROMPT_VERSION, callCount: 1, latencyMs: 1 };
  assert.equal(readRecallResult({ version: 1, matches: [], meta }, saved.packs).matches.length, 0);
  assert.throws(() => readRecallResult({ version: 1, matches: [{ assetPackId: 'invented', reasonZh: '相关。' }], meta }, saved.packs));
});
