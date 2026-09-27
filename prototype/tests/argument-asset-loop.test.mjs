import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArgumentAssetDecision, attachAssetToPackExpressions, isArgumentAssets, isArgumentAssetUsages, occurrenceFromNode, recordArgumentAssetUsage, removeArgumentAsset } from '../app/argument-assets.ts';
import { readArgumentAssetRecallInput, readArgumentAssetRecallResult, ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from '../app/argument-asset-recall.ts';
import { ARGUMENT_SCHEMA_VERSION, DEPOSIT_PROMPT_VERSION, THOUGHT_SCHEMA_VERSION, saveTopicAssetPack } from '../app/topic-assets.ts';
import { createEssayDocument, isPersistedWorkspace } from '../app/workspace-state.ts';

const now = '2026-09-13T08:00:00.000Z';
const meta = { model: 'test', promptVersion: DEPOSIT_PROMPT_VERSION };
function candidate(claimZh, claimQuote, reasonQuote, condition = '必须提供现实可用的替代方案。') {
  return { schemaVersion: ARGUMENT_SCHEMA_VERSION, topicTags: [], viewpoint: null, reasons: [], exampleIdea: null,
    sourceNodes: [{ sourceNodeId: 's1', type: 'claim', sourceQuote: claimQuote }, { sourceNodeId: 's2', type: 'reason', sourceQuote: reasonQuote }],
    argumentNodes: [{ nodeId: 'n1', type: 'claim', normalizedZh: claimZh, normalizedEn: null, usageScope: '适用于把社会成本纳入个人决策的公共政策。', conditions: [condition], sourceNodeIds: ['s1'] }, { nodeId: 'n2', type: 'reason', normalizedZh: '收费会提高高成本行为的直接代价，从而减少非必要需求。', normalizedEn: null, usageScope: null, conditions: [], sourceNodeIds: ['s2'] }],
    relations: [{ fromNodeId: 'n2', toNodeId: 'n1', type: 'supports' }], rejectedNodes: [],
    transferStructure: { triggerZh: '当一种行为把成本转嫁给社会，而收费工具可能改变个人选择时。', reasoningZh: '行为产生公共成本 → 收费把成本计入个人选择 → 非必要需求下降 → 同时保护缺乏替代选择的人。', adaptableRoles: [{ roleZh: '产生社会成本的行为', sourceValueZh: claimZh.includes('碳') ? '高碳排放' : '拥堵驾驶' }, { roleZh: '收费工具', sourceValueZh: claimZh.includes('碳') ? '碳税' : '拥堵费' }], failureConditions: [condition] },
    languageExpressions: [{ expression: 'place an unfair burden on sb', meaningZh: '给某人造成不公平负担', pattern: 'place + [负担] + on + [对象]', usageScope: null, sourceForm: 'place an unfair burden on low-income commuters', sourceQuote: claimQuote, attachedToNodeIds: ['n1'] }],
  };
}
async function save(documentId, versionId, claimZh, claimQuote, reasonQuote, id) {
  const essay = `${reasonQuote} ${claimQuote}`;
  return (await saveTopicAssetPack([], { documentId, sourceTitle: documentId, taskPrompt: `Prompt for ${documentId}`, essay, completion: { versionId, confirmedAt: now, saveReason: '' } }, candidate(claimZh, claimQuote, reasonQuote), meta, id, now)).pack;
}

test('occurrences stay revision-scoped while user decisions create, link, replace or skip long-term assets', async () => {
  const claimA = '对产生社会成本的行为收费可以成立，但要保护缺乏替代选择的人。';
  const packA = await save('essay-a', 'rev-a', claimA, 'Congestion charges can place an unfair burden on low-income commuters unless affordable alternatives exist.', 'Higher prices can discourage unnecessary journeys.', 'pack-a');
  const first = applyArgumentAssetDecision([], packA, { action: 'new' }, 'asset-a', now);
  assert.equal(isArgumentAssets(first.assets), true);
  assert.equal(first.asset.usageCount, 0);
  assert.equal(first.asset.abstraction.reasoningZh.includes('公共成本'), true);
  assert.equal(occurrenceFromNode(packA, packA.argumentNodes[0]).sourceRevisionId, 'rev-a');

  const claimB = '碳排放收费应反映社会成本，同时补偿没有低碳替代选择的家庭。';
  const packB = await save('essay-b', 'rev-b', claimB, 'Carbon charges can place an unfair burden on low-income commuters unless households receive support.', 'A visible carbon price can discourage wasteful consumption.', 'pack-b');
  const linked = applyArgumentAssetDecision(first.assets, packB, { action: 'link', assetId: 'asset-a' }, 'unused', now);
  assert.equal(linked.asset.claimZh, claimA, 'link must not overwrite the saved wording');
  assert.equal(linked.asset.occurrenceIds.length, 2);
  const linkedPack = attachAssetToPackExpressions(packB, linked.asset);
  assert.deepEqual(linkedPack.languageExpressions[0].attachedToAssetIds, ['asset-a']);

  const once = recordArgumentAssetUsage(linked.assets, [], { assetId: 'asset-a', documentId: 'essay-b', revisionId: 'rev-b', usedOccurrenceId: linked.asset.occurrenceIds[1], usageType: 'adapted', usedAt: now }, 'usage-1');
  const twice = recordArgumentAssetUsage(once.assets, once.usages, { assetId: 'asset-a', documentId: 'essay-b', revisionId: 'rev-b', usedOccurrenceId: linked.asset.occurrenceIds[1], usageType: 'adapted', usedAt: now }, 'usage-2');
  assert.equal(once.assets[0].usageCount, 1);
  assert.equal(twice.created, false);
  assert.equal(twice.assets[0].usageCount, 1);
  assert.equal(isArgumentAssetUsages(twice.usages, twice.assets), true);

  const replaced = applyArgumentAssetDecision(twice.assets, packB, { action: 'replace', assetId: 'asset-a' }, 'unused', now);
  assert.equal(replaced.asset.claimZh, claimB);
  assert.equal(replaced.asset.occurrenceIds.length, 2);
  assert.equal(replaced.asset.abstraction.revision, 2);
  assert.equal(replaced.asset.abstractionHistory.length, 1);
  assert.strictEqual(applyArgumentAssetDecision(replaced.assets, packB, { action: 'skip' }, 'unused', now).assets, replaced.assets);
});

test('recall accepts only active existing IDs and deletion leaves source packs independent', async () => {
  const pack = await save('essay-a', 'rev-a', '公共收费政策必须保护没有替代方案的弱势群体。', 'Charges can place an unfair burden on low-income commuters unless alternatives exist.', 'Prices can reduce unnecessary demand.', 'pack-a');
  const legacyAssets = applyArgumentAssetDecision([], pack, { action: 'new' }, 'legacy-a', now).assets;
  const thought = { assetId: 'thought-a', kind: 'thought', thought: '平均收益改善不代表每个人都同样受益。', useWhen: '讨论政策收益分布时。', rationale: '平均指标可能掩盖集中在少数群体上的代价。', limits: [], sources: [{ documentId: 'essay-a', revisionId: 'rev-a', sourceTitle: '旧作文', taskPrompt: 'Prompt', quote: 'Charges can place an unfair burden on low-income commuters unless alternatives exist.' }], status: 'active', createdAt: now, updatedAt: now, usageCount: 0 };
  const assets = [thought, ...legacyAssets];
  const input = { taskPrompt: 'Should cities introduce congestion charging?', currentDraft: '', assets };
  const recallInput = readArgumentAssetRecallInput(input);
  assert.deepEqual(recallInput.assets.map(asset => asset.assetId), ['thought-a']);
  assert.deepEqual(Object.keys(recallInput.assets[0]).sort(), ['assetId', 'limits', 'rationale', 'thought', 'useWhen']);
  const response = { version: 3, matches: [{ assetId: 'thought-a' }], meta: { model: 'test', promptVersion: ARGUMENT_ASSET_RECALL_PROMPT_VERSION, callCount: 1, latencyMs: 1 } };
  assert.deepEqual(readArgumentAssetRecallResult(response, assets).matches, [{ assetId: 'thought-a' }]);
  assert.throws(() => readArgumentAssetRecallResult({ ...response, matches: [{ assetId: 'thought-a', howToUse: '本题应该这样写。' }] }, assets), /INVALID_RESPONSE/);
  assert.throws(() => readArgumentAssetRecallResult({ ...response, matches: [{ assetId: 'invented' }] }, assets));

  const removed = removeArgumentAsset(assets, [{ usageId: 'u', assetId: 'thought-a', documentId: 'b', revisionId: 'r', usageType: 'reused', usedAt: now }], 'thought-a');
  assert.equal(removed.assets.length, 1);
  assert.equal(removed.usages.length, 0);
  assert.equal(pack.sourceNodes.length, 2, 'source history is not deleted with the long-term asset');

  const document = createEssayDocument('essay-a', now, { taskPrompt: 'Prompt', essay: 'Essay.' });
  const oldWorkspace = { version: 2, documents: [document], activeDocumentId: 'essay-a', savedAt: now, topicAssetPacks: [pack] };
  assert.equal(isPersistedWorkspace(oldWorkspace), true);
  assert.equal(isPersistedWorkspace({ ...oldWorkspace, argumentAssets: legacyAssets, argumentAssetUsages: [] }), true);
  assert.equal(isArgumentAssets(legacyAssets), true, 'old transfer structures remain readable');
  assert.equal(readArgumentAssetRecallInput({ ...input, assets: legacyAssets }).assets.length, 0, 'old structures stay readable but do not enter prewriting recall');
});

test('new deposits create a ThoughtAsset directly and another essay only adds source evidence', async () => {
  const thoughtCandidate = (quote) => ({ schemaVersion: THOUGHT_SCHEMA_VERSION, topicTags: [], viewpoint: null, reasons: [], exampleIdea: null, thought: { thought: '平均收益改善不代表每个人都同样受益。', useWhen: '讨论方案收益分布时。', rationale: '平均指标可能掩盖集中在少数人身上的代价。', limits: [], sourceQuotes: [quote] }, languageExpressions: [] });
  const quoteA = 'Averages can hide the fact that vulnerable users carry most of the cost.';
  const packA = (await saveTopicAssetPack([], { documentId: 'thought-a', sourceTitle: '公共服务数字化', taskPrompt: 'Digital services', essay: quoteA, completion: { versionId: 'thought-rev-a', confirmedAt: now, saveReason: '' } }, thoughtCandidate(quoteA), meta, 'thought-pack-a', now)).pack;
  assert.equal(packA.argumentNodes, undefined);
  const created = applyArgumentAssetDecision([], packA, { action: 'new' }, 'thought-asset', now);
  assert.equal(created.asset.kind, 'thought');
  assert.equal(created.asset.sources.length, 1);

  const quoteB = 'Online-only university services may leave some students unable to complete essential tasks.';
  const packB = (await saveTopicAssetPack([], { documentId: 'thought-b', sourceTitle: '大学服务线上化', taskPrompt: 'University services', essay: quoteB, completion: { versionId: 'thought-rev-b', confirmedAt: now, saveReason: '' } }, thoughtCandidate(quoteB), meta, 'thought-pack-b', now)).pack;
  const linked = applyArgumentAssetDecision(created.assets, packB, { action: 'link', assetId: 'thought-asset' }, 'unused', now);
  assert.equal(linked.asset.kind, 'thought');
  assert.deepEqual(linked.asset.sources.map(source => source.sourceTitle), ['公共服务数字化', '大学服务线上化']);
});
