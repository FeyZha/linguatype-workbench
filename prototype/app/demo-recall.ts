import { createDemoTopicAssets } from './demo-topic-assets.ts';
import { createDemoArgumentAssetState } from './demo-argument-assets.ts';
import { DEMO_DOCUMENTS } from './prototype-cases.ts';
import { createEssayDocument, type PersistedWorkspace } from './workspace-state.ts';

export const RECALL_DEMO_CASES = [
  {
    documentId: 'recall-demo-hit',
    label: '① 完全命中',
    title: '大学服务全面线上化',
    taskPrompt: 'Universities plan to move course registration and student financial support entirely online and close face-to-face counters. Do the advantages outweigh the disadvantages?',
    expectedCount: 1,
    explanation: '预期提醒 1 条旧积累。场景从政府服务换成大学服务，但仍涉及更高效的新方式与参与门槛。你应看到原先保存的判断和来源，不会得到这道题的答案。',
  },
  {
    documentId: 'recall-demo-boundary',
    label: '② 边界情况',
    title: '同是服务网站，只改装饰配色',
    taskPrompt: 'A public-service website is choosing between blue and green decorative graphics. Its functions, accessibility and online and offline service channels will remain exactly the same. Should the choice be based mainly on visual preference?',
    expectedCount: 0,
    explanation: '预期不提醒。虽然同样提到公共服务网站，题目只涉及装饰配色，没有改变参与门槛。如果仍提醒了那条旧积累，记录为本例的过宽召回。',
  },
  {
    documentId: 'recall-demo-miss',
    label: '③ 不该召回',
    title: '太空探索与艺术资助',
    taskPrompt: 'Some people believe governments should spend more on space exploration, while others prefer funding the arts. Discuss both views and give your own opinion.',
    expectedCount: 0,
    explanation: '预期不提醒。资金分配题没有涉及新服务方式造成的参与门槛，不能因为都谈政府决策就拉出这条积累。',
  },
] as const;

/** Existing synthetic source + three empty drafts; only used in ?demo=recall. */
export function createRecallDemoWorkspace(): PersistedWorkspace {
  const packs = createDemoTopicAssets().filter(pack => pack.sourceDocumentId === 'demo-digital-services');
  const source = DEMO_DOCUMENTS.find(document => document.documentId === 'demo-digital-services');
  if (packs.length !== 1 || !source) throw new Error('MISSING_RECALL_DEMO_SOURCE');
  const { assets, usages } = createDemoArgumentAssetState(packs);
  const now = '2026-09-26T00:00:00.000Z';
  return {
    version: 2,
    documents: [
      ...RECALL_DEMO_CASES.map(item => createEssayDocument(item.documentId, now, { taskPrompt: item.taskPrompt, essay: '', promptSource: { kind: 'custom' } })),
      structuredClone(source),
    ],
    activeDocumentId: RECALL_DEMO_CASES[0].documentId,
    savedAt: now,
    topicAssetPacks: packs,
    argumentAssets: assets,
    argumentAssetUsages: usages,
    expressionMemories: [],
  };
}
