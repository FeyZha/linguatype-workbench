import test from 'node:test';
import assert from 'node:assert/strict';
import { ARGUMENT_SCHEMA_VERSION, DEPOSIT_PROMPT_VERSION, isArgumentGraphAsset, isTopicAssetPacks, readTopicAssetCandidate, removeArgumentNode, saveTopicAssetPack } from '../app/topic-assets.ts';

const essay = 'Congestion charges make drivers reconsider unnecessary journeys. Low-income commuters should be protected when public transport is unavailable.';
const candidate = {
  schemaVersion: ARGUMENT_SCHEMA_VERSION,
  topicTags: [], viewpoint: null, reasons: [], exampleIdea: null,
  sourceNodes: [
    { sourceNodeId: 's1', type: 'reason', sourceQuote: 'Congestion charges make drivers reconsider unnecessary journeys.' },
    { sourceNodeId: 's2', type: 'claim', sourceQuote: 'Low-income commuters should be protected when public transport is unavailable.' },
  ],
  argumentNodes: [
    { nodeId: 'n1', type: 'claim', normalizedZh: '对产生公共成本的行为收费时，应保护缺乏现实替代方案的人。', normalizedEn: null, usageScope: '适用于通过收费减少负外部性的公共政策。', conditions: ['目标群体缺乏可行替代方案。'], sourceNodeIds: ['s2'] },
    { nodeId: 'n2', type: 'reason', normalizedZh: '提高行为的直接成本会减少非必要使用。', normalizedEn: null, usageScope: null, conditions: [], sourceNodeIds: ['s1'] },
  ],
  relations: [{ fromNodeId: 'n2', toNodeId: 'n1', type: 'supports' }],
  rejectedNodes: [],
  transferStructure: { principleZh: '当行为产生社会成本时，让行为者承担部分成本具有正当性。', mechanismZh: '价格信号把社会成本计入个人选择，从而减少过度使用。', conditions: ['必须保护缺乏现实替代方案的人。'], adaptableRoles: [{ roleZh: '产生社会成本的行为', sourceValueZh: '拥堵驾驶' }, { roleZh: '收费工具', sourceValueZh: '拥堵费' }] },
  languageExpressions: [{ expression: 'reconsider unnecessary journeys', meaningZh: '重新考虑非必要出行', pattern: 'reconsider + [非必要行为]', usageScope: null, sourceForm: 'reconsider unnecessary journeys', sourceQuote: 'Congestion charges make drivers reconsider unnecessary journeys.', attachedToNodeIds: ['n2'] }],
};
const completion = { versionId: 'confirmed-1', confirmedAt: '2026-09-12T12:00:00.000Z', saveReason: '' };

test('argument assets separate source AST, normalized nodes and attached expressions', async () => {
  const parsed = readTopicAssetCandidate(candidate, essay);
  assert.equal(isArgumentGraphAsset(parsed), true);
  assert.equal(parsed.argumentNodes[0].normalizedZh.includes('拥堵'), false);
  const saved = await saveTopicAssetPack([], { documentId: 'essay-1', sourceTitle: 'Congestion', taskPrompt: 'Should cities charge drivers?', essay, completion }, parsed, { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION }, 'asset-1', completion.confirmedAt);
  assert.equal(isTopicAssetPacks(saved.packs), true);
  assert.equal(saved.pack.argumentNodes[0].sourceEvidence[0].sourceQuote, candidate.sourceNodes[1].sourceQuote);
  assert.equal(saved.pack.argumentNodes[0].sourceEvidence[0].revisionId, completion.versionId);
  assert.equal(saved.pack.languageExpressions[0].attachedToNodeIds[0], saved.pack.argumentNodes[1].nodeId);
  assert.ok(saved.pack.argumentNodes[0].canonicalKey);
  assert.equal(saved.pack.transferStructure.adaptableRoles[1].sourceValueZh, '拥堵费');
});

test('invalid graph edges and invented evidence are rejected independently of wording', () => {
  assert.throws(() => readTopicAssetCandidate({ ...candidate, relations: [{ fromNodeId: 'n1', toNodeId: 'n2', type: 'supports' }] }, essay), /INVALID_RESPONSE/);
  assert.throws(() => readTopicAssetCandidate({ ...candidate, sourceNodes: [{ ...candidate.sourceNodes[0], sourceQuote: 'Invented evidence.' }, candidate.sourceNodes[1]] }, essay), /INVALID_RESPONSE/);
  assert.throws(() => readTopicAssetCandidate({ ...candidate, languageExpressions: [{ ...candidate.languageExpressions[0], attachedToNodeIds: ['missing'] }] }, essay), /INVALID_RESPONSE/);
});

test('deleting a node also removes dangling relations and expressions', () => {
  const edited = removeArgumentNode(candidate, 'n2');
  assert.equal(edited.argumentNodes.length, 1);
  assert.equal(edited.relations.length, 0);
  assert.equal(edited.languageExpressions.length, 0);
  assert.doesNotThrow(() => readTopicAssetCandidate(edited, essay));
});

test('deleting a root claim cascades through its argument branch', () => {
  const edited = removeArgumentNode(candidate, 'n1');
  assert.equal(edited.argumentNodes.length, 0);
  assert.equal(edited.sourceNodes.length, 0);
  assert.equal(edited.relations.length, 0);
  assert.equal(edited.languageExpressions.length, 0);
  assert.doesNotThrow(() => readTopicAssetCandidate(edited, essay));
});
