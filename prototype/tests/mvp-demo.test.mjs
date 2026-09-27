import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isDemoMode, isLearnerDemoMode, workspaceStorageKey } from '../app/workspace-mode.ts';
import { createSimulatedLearnerWorkspace, SIMULATED_LEARNER_NOTICE } from '../app/demo-simulated-learner.ts';
import { readWorkspaceBackup } from '../app/workspace-data.ts';
import { readExtractedIdeas } from '../app/server/idea-extraction.ts';
import { spaceSentenceButtons } from '../app/sentence-tracking.ts';
import { DEMO_DOCUMENTS, DEMO_RECALL_DOCUMENT_ID } from '../app/prototype-cases.ts';
import { DEMO_EMPTY_DEPOSIT_CASE, DEMO_TOPIC_ASSETS, createDemoTopicAssets } from '../app/demo-topic-assets.ts';
import { createDemoArgumentAssetState } from '../app/demo-argument-assets.ts';
import { isTopicAssetPacks, readTopicAssetCandidate, topicAssetItemCount, topicLanguageExpressions } from '../app/topic-assets.ts';

test('demo mode ships inspectable transferable-expression seed data without sharing references', () => {
  assert.equal(isTopicAssetPacks(DEMO_TOPIC_ASSETS), true);
  assert.equal(DEMO_TOPIC_ASSETS.length, 3);
  const documents = new Map(DEMO_DOCUMENTS.map(document => [document.documentId, document]));
  for (const pack of DEMO_TOPIC_ASSETS) {
    const source = documents.get(pack.sourceDocumentId);
    assert(source);
    const expressions = topicLanguageExpressions(pack);
    assert.equal(expressions.length, 2);
    for (const expression of expressions) {
      assert.notEqual(expression.expression.toLowerCase(), expression.sourceQuote.toLowerCase());
      assert(source.essay.includes(expression.sourceQuote));
      assert(expression.sourceQuote.toLowerCase().includes(expression.sourceForm.toLowerCase()));
    }
  }
  const copy = createDemoTopicAssets();
  copy[0].languageExpressions[0].expression = 'changed only in this test copy';
  assert.notEqual(copy[0].languageExpressions[0].expression, DEMO_TOPIC_ASSETS[0].languageExpressions[0].expression);
});

test('demo fixtures include an explicit empty extraction boundary', () => {
  const source = DEMO_DOCUMENTS.find(document => document.documentId === DEMO_EMPTY_DEPOSIT_CASE.documentId);
  assert(source);
  const parsed = readTopicAssetCandidate(DEMO_EMPTY_DEPOSIT_CASE.candidate, source.essay);
  assert.equal(topicAssetItemCount(parsed), 0);
  assert.deepEqual(parsed.languageExpressions, []);
});

test('demo opens before the user has formed an argument and recalls only a saved thought', () => {
  const scenario = DEMO_DOCUMENTS.find(document => document.documentId === DEMO_RECALL_DOCUMENT_ID);
  assert(scenario);
  assert.match(scenario.taskPrompt, /Universities/);
  assert.equal(scenario.essay, '');
  const state = createDemoArgumentAssetState(createDemoTopicAssets());
  const digitalAccess = state.assets.find(asset => asset.kind === 'thought' && asset.thought.includes('平均效率'));
  assert(digitalAccess);
  assert.match(digitalAccess.thought, /不代表所有群体都同样受益/);
  assert.match(digitalAccess.useWhen, /更高效的新方案/);
  assert.equal(digitalAccess.sources.some(source => source.sourceTitle === '公共服务数字化'), true);
  assert.equal('abstraction' in digitalAccess, false);
});

test('simulated learner demo embeds ten full essays, expression memories and confirmed cross-essay thought reuse', () => {
  const workspace = createSimulatedLearnerWorkspace();
  assert.match(SIMULATED_LEARNER_NOTICE, /模拟生成/);
  assert.equal(workspace.documents.length, 10);
  assert.equal(workspace.expressionMemories.length, 10);
  assert.equal(workspace.argumentAssets.length, 5);
  assert.equal(workspace.argumentAssetUsages.length, 2);
  assert.equal(new Set(workspace.documents.map(document => document.taskPrompt)).size, 10);
  assert.equal(workspace.documents.every(document => document.essay.trim().split(/\s+/).length >= 250), true);
  const ids = new Set(workspace.documents.map(document => document.documentId));
  assert.equal(workspace.expressionMemories.every(item => ids.has(item.documentId) && item.revealCount === 1 && item.status === 'active'), true);
  const reused = workspace.argumentAssets.find(asset => asset.kind === 'thought' && asset.assetId === 'fresh-thought-1');
  assert(reused);
  assert.deepEqual([...new Set(reused.sources.map(source => source.documentId))].sort(), ['fresh-essay-1', 'fresh-essay-5']);
  assert.equal(reused.usageCount, 1);
  assert.match(reused.useWhen, /^当技术渠道能够提高便利/);
  assert.match(reused.thought, /不能因此取消人与人直接接触/);
  assert.doesNotMatch(reused.thought, /社交媒体|机器人|老年人/);
  assert.equal(workspace.argumentAssets.every(asset => asset.kind !== 'thought' || asset.useWhen?.startsWith('当')), true);
});

test('demo is a complete restorable workspace with separate storage, real checks and traceable sources', () => {
  assert.deepEqual(spaceSentenceButtons([112, 112, 196]), [112, 156, 200]);
  assert.deepEqual(spaceSentenceButtons([]), []);
  assert.equal(isDemoMode(''), true);
  assert.equal(isDemoMode('?demo=1'), true);
  assert.equal(isLearnerDemoMode('?demo=learner'), true);
  assert.equal(isDemoMode('?demo=0'), false);
  assert.equal(workspaceStorageKey('linguatype:workspace:v2', '?demo=learner'), 'linguatype:demo-learner:v3:linguatype:workspace:v2');
  for (const key of ['linguatype:workspace:v2', 'linguatype:draft:v1', 'linguatype:conflict:v2', 'linguatype:profile-epoch']) {
    assert.notEqual(workspaceStorageKey(key, ''), key);
    assert.equal(workspaceStorageKey(key, '?demo=0'), key);
    assert.notEqual(workspaceStorageKey(key, '?demo=1'), key);
    assert.notEqual(workspaceStorageKey(key, '?demo=learner'), workspaceStorageKey(key, '?demo=1'));
  }
  const workspace = readWorkspaceBackup(readFileSync(new URL('../app/mvp-demo.json', import.meta.url), 'utf8'));
  assert.equal(workspace.documents.length, 5);
  assert.equal(workspace.activeDocumentId, 'mvp-current');
  const library = workspace.assetLibrary;
  for (const assets of [library.assets, library.ideas, library.reasons]) {
    assert(assets.length >= 2);
    assert(assets.some(a => a.quality === 'usable'));
    for (const asset of assets) {
      const source = workspace.documents.find(d => d.documentId === asset.sourceDocumentId)?.completions.find(c => c.completionId === asset.sourceCompletionId);
      assert(source);
      for (const quote of asset.nodes ? [...asset.nodes, ...asset.links].map(n => n.sourceQuote) : [asset.sourceQuote]) assert(source.essay.includes(quote));
    }
  }
  const finished = workspace.documents.find(d => d.documentId === 'mvp-finished-city').completions[0];
  for (const reviews of [finished.usageReviews, finished.ideaUsageReviews, finished.reasonUsageReviews]) {
    assert.equal(reviews[0].status, 'ready');
    assert(reviews[0].modelCalls.length > 0);
  }
  const reviews = [...finished.usageReviews, ...finished.ideaUsageReviews, ...finished.reasonUsageReviews];
  assert.equal(reviews.length, 14);
  assert.equal(reviews.filter(r => r.correction === 'exclude').length, 5);
  assert.equal(workspace.documents.find(d => d.documentId === 'mvp-new-topic').essay, '');
});

test('extra extracted ideas are bounded without weakening source, shape or duplicate validation', () => {
  const input = { taskPrompt: 'Discuss transport.', completedEssay: 'Buses reduce traffic. Trains connect cities. Fares affect access. Roads need repair.', existingIdeas: [] };
  const candidates = [
    { textZh: '公交减少车流。', sourceQuote: 'Buses reduce traffic.' },
    { textZh: '火车连接城市。', sourceQuote: 'Trains connect cities.' },
    { textZh: '票价影响可及性。', sourceQuote: 'Fares affect access.' },
    { textZh: '道路需要维修。', sourceQuote: 'Roads need repair.' },
  ];
  assert.deepEqual(readExtractedIdeas({ candidates }, input), candidates.slice(0, 3));
  assert.throws(() => readExtractedIdeas({ candidates: [{ ...candidates[0], sourceQuote: 'Invented evidence.' }, ...candidates] }, input));
  assert.throws(() => readExtractedIdeas({ candidates: [candidates[0], candidates[0], ...candidates] }, input));
  assert.throws(() => readExtractedIdeas(null, input));
});
