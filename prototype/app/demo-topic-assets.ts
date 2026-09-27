import { DEMO_DOCUMENTS } from './prototype-cases.ts';
import { DEPOSIT_PROMPT_VERSION, THOUGHT_SCHEMA_VERSION, type TopicAssetCandidate, type TopicAssetPack } from './topic-assets.ts';

const DEMO_SAVED_AT = '2026-09-12T10:00:00.000Z';

type SeedExpression = {
  expression: string;
  meaningZh: string;
  pattern: string | null;
  usageScope: string | null;
  sourceForm: string;
  sourceQuote: string;
};

type SeedPack = {
  id: string;
  documentId: string;
  sourceTitle: string;
  topicTags: string[];
  sourceEssayHash: string;
  saveReason: string;
  thought: string;
  claimQuote: string;
  useWhen: string;
  rationale: string;
  limits: string[];
  expressions: SeedExpression[];
};

const SEED_PACKS: SeedPack[] = [
  {
    id: 'demo-pack-public-transport',
    documentId: 'demo-public-transport',
    sourceTitle: '公共交通与道路投资',
    topicTags: ['公共交通', '城市政策'],
    sourceEssayHash: '40720b993510e824389fe98bf725e01a69feac32db669351939ee0c688d7f765',
    saveReason: '这篇文章让我确认了描述公共交通影响的几种表达。',
    thought: '个人选择把成本转嫁给社会时，公共投入可以优先支持能降低整体外部成本的共享方案，同时保留必要服务。',
    claimQuote: 'In conclusion, road maintenance should continue where it supports safety and essential access, but most new investment should make shared transport frequent, affordable and well connected.',
    useWhen: '讨论个人选择产生公共成本，以及共享方案是否值得优先投入时。',
    rationale: '高运力共享方案可以降低单位出行带来的拥堵、污染和空间成本。',
    limits: ['共享方案不能可靠、可负担地覆盖真实需求时，不能据此削减必要服务。'],
    expressions: [
      {
        expression: 'reduce air pollution',
        meaningZh: '减少空气污染',
        pattern: 'reduce + [问题或负面影响]',
        usageScope: '用于说明某项措施降低环境或社会负面影响。',
        sourceForm: 'reduce air pollution',
        sourceQuote: 'Frequent services also reduce air pollution and the amount of urban land used for parking.',
      },
      {
        expression: 'depend entirely on sth',
        meaningZh: '完全依赖某事物',
        pattern: 'depend entirely on + [对象]',
        usageScope: '用于表示方案、群体或系统把支持全部建立在某个对象上。',
        sourceForm: 'depend entirely on trains',
        sourceQuote: 'Road supporters correctly note that emergency services, delivery companies and rural communities cannot depend entirely on trains.',
      },
    ],
  },
  {
    id: 'demo-pack-digital-services',
    documentId: 'demo-digital-services',
    sourceTitle: '公共服务数字化',
    topicTags: ['公共服务', '数字化'],
    sourceEssayHash: 'd877ce99734e94909858ae38dcef8ed33f7b77a4640be92f49a43cb0538569c1',
    saveReason: '我想留下说明数字服务障碍和评估方式的表达。',
    thought: '提高平均效率，不代表所有群体都同样受益；评价方案时还要注意新的参与门槛是否把成本集中到特定群体。',
    claimQuote: 'A fair system offers several routes to the same service and allows people to move between them without starting again.',
    useWhen: '讨论一种更高效的新方案是否让部分人更难参与或获得服务时。',
    rationale: '平均指标会掩盖分配差异；新的访问门槛可能让少数群体承担大部分代价。',
    limits: ['如果不存在真实的受影响群体，或新的门槛可以忽略，这条思考不成立。'],
    expressions: [
      {
        expression: 'create further barriers for sb',
        meaningZh: '给某人带来更多障碍',
        pattern: 'create further barriers for + [人或群体]',
        usageScope: '用于说明制度、设计或环境让特定群体更难完成某事。',
        sourceForm: 'create further barriers for people with disabilities or unusual personal circumstances',
        sourceQuote: 'Poorly designed identity checks can create further barriers for people with disabilities or unusual personal circumstances.',
      },
      {
        expression: 'measure success by whether sth',
        meaningZh: '以某事是否发生来衡量成功',
        pattern: 'measure success by whether + [结果]',
        usageScope: '用于提出比数量或表面指标更贴近实际结果的评估标准。',
        sourceForm: 'measure success by whether citizens complete their tasks',
        sourceQuote: 'Governments should measure success by whether citizens complete their tasks, not simply by how many forms have moved online.',
      },
    ],
  },
  {
    id: 'demo-pack-remote-work',
    documentId: 'demo-remote-work',
    sourceTitle: '远程工作与生活质量',
    topicTags: ['远程工作', '工作方式'],
    sourceEssayHash: '84807d20010fd07d293482baf236b496ab9ada0bddedfd9a8ca336a4e987e72b',
    saveReason: '我认可这篇文章中描述工作安排和员工管理的表达。',
    thought: '灵活安排只有在边界清晰、支持公平时才更可能带来净收益，否则自主性可能变成持续待命或协作成本。',
    claimQuote: 'In conclusion, flexibility improves quality of life only when it is supported by clear expectations, fair access and purposeful opportunities to work together.',
    useWhen: '讨论灵活性是否真正改善个人处境，以及配套边界是否充分时。',
    rationale: '缺少清晰规则时，空间自由会转化为持续在线和协作困难。',
    limits: ['任务必须依赖现场设施或持续面对面协作时，灵活安排的收益会受到限制。'],
    expressions: [
      {
        expression: 'set realistic hours',
        meaningZh: '设定切合实际的工作时段',
        pattern: 'set realistic + [时间安排]',
        usageScope: '用于说明组织需要给工作、学习或服务设置可执行的时间边界。',
        sourceForm: 'set realistic hours',
        sourceQuote: 'Employers must therefore set realistic hours and avoid treating home-based staff as permanently available.',
      },
      {
        expression: 'avoid treating sb as sth',
        meaningZh: '避免把某人当作某种情况或角色来对待',
        pattern: 'avoid treating + [对象] + as + [角色或状态]',
        usageScope: '用于提醒管理者不要把人长期视为某种可随时支配的角色或状态。',
        sourceForm: 'avoid treating home-based staff as permanently available',
        sourceQuote: 'Employers must therefore set realistic hours and avoid treating home-based staff as permanently available.',
      },
    ],
  },
];

const documents = new Map(DEMO_DOCUMENTS.map(document => [document.documentId, document]));

function createSeedPack(seed: SeedPack): TopicAssetPack {
  const document = documents.get(seed.documentId);
  if (!document) throw new Error(`Missing demo document: ${seed.documentId}`);
  const versionId = `${seed.id}:confirmed-v1`;
  return {
    id: seed.id,
    sourceDocumentId: document.documentId,
    sourceTitle: seed.sourceTitle,
    sourcePrompt: document.taskPrompt,
    sourceEssaySnapshot: document.essay,
    sourceEssayHash: seed.sourceEssayHash,
    createdAt: DEMO_SAVED_AT,
    updatedAt: DEMO_SAVED_AT,
    revision: 1,
    savedAt: DEMO_SAVED_AT,
    topicTags: [],
    viewpoint: null,
    reasons: [],
    exampleIdea: null,
    schemaVersion: THOUGHT_SCHEMA_VERSION,
    thought: { thought: seed.thought, useWhen: seed.useWhen, rationale: seed.rationale, limits: seed.limits, sourceQuotes: [seed.claimQuote, seed.expressions[0].sourceQuote] },
    languageExpressions: seed.expressions.map((expression, index) => ({
      ...expression,
      expressionId: `${seed.id}:r1:e${index + 1}`,
      sourceDocumentId: document.documentId,
      sourceRevisionId: versionId,
      provenance: { model: 'demo-seed', promptVersion: DEPOSIT_PROMPT_VERSION },
    })),
    extractionMeta: { model: 'demo-seed', promptVersion: DEPOSIT_PROMPT_VERSION },
    completion: { versionId, confirmedAt: DEMO_SAVED_AT, saveReason: seed.saveReason },
    previousRevisions: [],
  };
}

/** Synthetic, isolated fixtures for review; they never seed a personal workspace. */
export const DEMO_TOPIC_ASSETS = SEED_PACKS.map(createSeedPack);

/** Boundary fixture: a confirmed essay with no reliable expression must stay out of the library. */
export const DEMO_EMPTY_DEPOSIT_CASE: { id: string; documentId: string; candidate: TopicAssetCandidate } = {
  id: 'demo-empty-expression-case',
  documentId: 'demo-household-waste',
  candidate: { topicTags: [], viewpoint: null, reasons: [], exampleIdea: null, schemaVersion: THOUGHT_SCHEMA_VERSION, thought: null, languageExpressions: [] },
};

export function createDemoTopicAssets() {
  return structuredClone(DEMO_TOPIC_ASSETS);
}
