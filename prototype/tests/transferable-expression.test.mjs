import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPOSIT_PROMPT_VERSION, isTopicAssetPacks, readTopicAssetCandidate, saveTopicAssetPack, topicLanguageExpressions } from '../app/topic-assets.ts';
import { expressionKey, readTransferableExpressionCandidate } from '../app/transferable-expression.ts';
import { DEPOSIT_PROMPT, readDepositInput } from '../app/server/topic-deposit.ts';

const sourceQuote = 'High housing costs place a heavy financial burden on young families.';
const essay = `${sourceQuote} This pressure may discourage young people from starting a family.`;
const candidate = {
  topicTags: ['housing'], viewpoint: null, reasons: [], exampleIdea: null,
  languageExpressions: [{
    expression: 'place a heavy burden on sb',
    meaningZh: '给某人造成沉重负担',
    pattern: 'place a heavy + [类型] + burden on + [对象]',
    usageScope: 'burden 表示负担；类型修饰语必须自然。',
    sourceForm: 'place a heavy financial burden on young families',
    sourceQuote,
  }],
};
const completion = { versionId: 'completed-1', confirmedAt: '2026-09-12T00:00:00.000Z', saveReason: '' };
const meta = { model: 'test-model', promptVersion: DEPOSIT_PROMPT_VERSION };

test('transferable expression is separate from its exact source evidence', async () => {
  const parsed = readTopicAssetCandidate(candidate, essay);
  assert.equal(parsed.languageExpressions[0].expression, 'place a heavy burden on sb');
  assert.equal(parsed.languageExpressions[0].sourceForm, 'place a heavy financial burden on young families');
  const saved = await saveTopicAssetPack([], { documentId: 'housing-essay', sourceTitle: 'Housing', taskPrompt: 'Housing costs', essay, completion }, parsed, meta, 'pack-1', completion.confirmedAt);
  const asset = saved.pack.languageExpressions[0];
  assert.equal(asset.sourceDocumentId, 'housing-essay');
  assert.equal(asset.sourceRevisionId, 'completed-1');
  assert.deepEqual(asset.provenance, meta);
  assert.equal(isTopicAssetPacks(saved.packs), true);
});

test('source quote and exact source form are deterministic trust boundaries', () => {
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], sourceQuote: 'Invented source.' }, essay));
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], sourceForm: 'place an invented burden on families' }, essay));
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], expression: 'Housing costs place a heavy financial burden on young families.' }, essay));
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], expression: 'pose a serious threat to sth' }, essay));
  const plainFact = 'Many elderly residents live alone because their adult children work elsewhere.';
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], expression: 'live alone', sourceForm: 'live alone', sourceQuote: plainFact }, plainFact));
  const projectFact = 'A local project installed vegetable beds on twelve buildings.';
  assert.throws(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], expression: 'install sth on sth', sourceForm: 'installed vegetable beds on twelve buildings', sourceQuote: projectFact }, projectFact));
  assert.doesNotThrow(() => readTransferableExpressionCandidate({ ...candidate.languageExpressions[0], expression: '', meaningZh: '' }, essay, true));
});

test('canonical expression key prevents object-only duplicates across essays', async () => {
  assert.equal(expressionKey('discourage someone from doing something'), expressionKey('discourage sb from doing sth'));
  const first = await saveTopicAssetPack([], { documentId: 'housing-essay', sourceTitle: 'Housing', taskPrompt: 'Housing costs', essay, completion }, candidate, meta, 'pack-1', completion.confirmedAt);
  const otherQuote = 'Long journeys place a heavy emotional burden on daily commuters.';
  const duplicate = { ...candidate, languageExpressions: [{ ...candidate.languageExpressions[0], sourceForm: 'place a heavy emotional burden on daily commuters', sourceQuote: otherQuote }] };
  await assert.rejects(saveTopicAssetPack(first.packs, { documentId: 'transport-essay', sourceTitle: 'Transport', taskPrompt: 'Commuting', essay: otherQuote, completion: { ...completion, versionId: 'completed-2' } }, duplicate, meta, 'pack-2', completion.confirmedAt), /DUPLICATE_EXPRESSION/);
});

test('a later revision of the same essay keeps its reusable expression', async () => {
  const first = await saveTopicAssetPack([], { documentId: 'housing-essay', sourceTitle: 'Housing', taskPrompt: 'Housing costs', essay, completion }, candidate, meta, 'pack-1', completion.confirmedAt);
  const laterEssay = `${essay} These costs can also delay home ownership.`;
  const later = await saveTopicAssetPack(first.packs, { documentId: 'housing-essay', sourceTitle: 'Housing', taskPrompt: 'Housing costs', essay: laterEssay, completion: { ...completion, versionId: 'completed-2' } }, candidate, meta, 'pack-2', completion.confirmedAt);
  assert.equal(later.pack.revision, 2);
  assert.equal(later.pack.languageExpressions[0].expression, candidate.languageExpressions[0].expression);
  assert.equal(later.pack.previousRevisions[0].languageExpressions[0].sourceRevisionId, 'completed-1');
});

test('historical collocations remain readable without invented abstraction metadata', () => {
  const old = { topicTags: [], viewpoint: null, reasons: [], exampleIdea: null, collocations: [{ expression: 'heavy financial burden', meaningZh: '沉重的经济负担', sourceQuote }] };
  assert.deepEqual(readTopicAssetCandidate(old, essay), old);
  const shown = topicLanguageExpressions(old)[0];
  assert.equal(shown.legacy, true);
  assert.equal(shown.pattern, null);
  assert.equal('sourceRevisionId' in shown, false);
});

test('deposit contract accepts dedup context and names the four separate gates', () => {
  const input = readDepositInput({ documentId: 'd1', taskPrompt: 'Housing', snapshot: essay, existingExpressions: ['place a heavy burden on sb'] });
  assert.deepEqual(input.existingExpressions, ['place a heavy burden on sb']);
  for (const rule of ['来源真实', '表达自然', '跨题可用', '抽象不失真']) assert.match(DEPOSIT_PROMPT, new RegExp(rule));
});
