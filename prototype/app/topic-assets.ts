import { textHash } from './essay-feedback.ts';
import { expressionKey, isLegacyCollocations, isSavedTransferableExpression, readTransferableExpressions, type LegacyCollocation, type TransferableExpression, type TransferableExpressionCandidate } from './transferable-expression.ts';

export const DEPOSIT_API_PATH = '/api/deposit';
export const RECALL_API_PATH = '/api/recall';
export const DEPOSIT_PROMPT_VERSION = 'thought-asset-extraction-v5-bounded-supported-judgment';
export const RECALL_PROMPT_VERSION = 'topic-asset-recall-v1-existing-ids';

export const ARGUMENT_SCHEMA_VERSION = 2 as const;
export const THOUGHT_SCHEMA_VERSION = 3 as const;
export type ArgumentNodeType = 'claim' | 'reason' | 'mechanism' | 'condition' | 'example' | 'counterpoint' | 'response';
export type ArgumentRelationType = 'supports' | 'explains' | 'qualifies' | 'opposes' | 'example_of';
export type SourceArgumentNode = { sourceNodeId: string; type: ArgumentNodeType; sourceQuote: string };
export type ArgumentNodeCandidate = {
  nodeId: string;
  type: ArgumentNodeType;
  normalizedZh: string;
  normalizedEn: string | null;
  usageScope: string | null;
  conditions: string[];
  sourceNodeIds: string[];
};
export type SourceEvidence = { documentId: string; revisionId: string; taskPrompt: string; sourceQuote: string };
export type ArgumentNode = ArgumentNodeCandidate & {
  canonicalKey: string;
  sourceEvidence: SourceEvidence[];
  provenance: { model: string; promptVersion: string };
};
export type ArgumentRelation = { fromNodeId: string; toNodeId: string; type: ArgumentRelationType };
export type RejectedSourceNode = { sourceNodeId: string; reasonZh: string };
export type LegacyArgumentTransferStructure = {
  principleZh: string;
  mechanismZh: string | null;
  conditions: string[];
  adaptableRoles: Array<{ roleZh: string; sourceValueZh: string }>;
};
export type ReusableReasoningPattern = {
  triggerZh: string;
  reasoningZh: string;
  adaptableRoles: Array<{ roleZh: string; sourceValueZh: string }>;
  failureConditions: string[];
};
export type ArgumentTransferStructure = LegacyArgumentTransferStructure | ReusableReasoningPattern;
export function isReusableReasoningPattern(value: ArgumentTransferStructure): value is ReusableReasoningPattern { return 'triggerZh' in value; }
export type ThoughtAssetCandidate = {
  thought: string;
  useWhen: string | null;
  rationale: string | null;
  limits: string[];
  sourceQuotes: string[];
};

export type TopicAssetCandidate = {
  topicTags: string[];
  viewpoint: { textEn: string; meaningZh: string; sourceQuote: string } | null;
  reasons: Array<{ summaryZh: string; sourceQuote: string }>;
  exampleIdea: { summaryZh: string; sourceQuote: string | null } | null;
  languageExpressions?: TransferableExpressionCandidate[];
  /** Historical records only. New extraction writes languageExpressions. */
  collocations?: LegacyCollocation[];
  /** New deposits use a source AST plus normalized graph. Legacy candidates omit these fields. */
  schemaVersion?: typeof ARGUMENT_SCHEMA_VERSION | typeof THOUGHT_SCHEMA_VERSION;
  sourceNodes?: SourceArgumentNode[];
  argumentNodes?: ArgumentNodeCandidate[];
  relations?: ArgumentRelation[];
  rejectedNodes?: RejectedSourceNode[];
  /** Stable reasoning separated from topic-bound source occurrences. */
  transferStructure?: ArgumentTransferStructure | null;
  /** Current deposits write one optional source-grounded thought; AST fields are legacy-only. */
  thought?: ThoughtAssetCandidate | null;
};

export type TopicAssetRevision = Omit<TopicAssetCandidate, 'languageExpressions' | 'argumentNodes'> & {
  languageExpressions?: TransferableExpression[];
  argumentNodes?: ArgumentNode[];
  sourceTitle: string;
  sourcePrompt: string;
  sourceEssaySnapshot: string;
  sourceEssayHash: string;
  revision: number;
  savedAt: string;
  extractionMeta: { model: string; promptVersion: string };
  completion?: { versionId: string; confirmedAt: string; saveReason: string };
};

export type TopicAssetPack = TopicAssetRevision & {
  id: string;
  sourceDocumentId: string;
  createdAt: string;
  updatedAt: string;
  previousRevisions: TopicAssetRevision[];
};

export type RecallMatch = { assetPackId: string; reasonZh: string };

function chinese(value: string) { return /[\u3400-\u9fff]/.test(value); }
function clean(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_RESPONSE');
  return value.trim();
}

const NODE_TYPES = new Set<ArgumentNodeType>(['claim', 'reason', 'mechanism', 'condition', 'example', 'counterpoint', 'response']);
const RELATION_TYPES = new Set<ArgumentRelationType>(['supports', 'explains', 'qualifies', 'opposes', 'example_of']);
const allowedRelation = (from: ArgumentNodeType, relation: ArgumentRelationType, to: ArgumentNodeType) =>
  relation === 'supports' ? from === 'reason' && to === 'claim'
    : relation === 'explains' ? from === 'mechanism' && to === 'reason'
      : relation === 'qualifies' ? from === 'condition' && ['claim', 'reason', 'mechanism'].includes(to)
        : relation === 'example_of' ? from === 'example' && ['claim', 'reason', 'mechanism'].includes(to)
          : (from === 'counterpoint' && to === 'claim') || (from === 'response' && to === 'counterpoint');

function readArgumentGraph(data: Record<string, unknown>, snapshot: string, meaning: (value: unknown, max: number) => string) {
  if (data.schemaVersion !== ARGUMENT_SCHEMA_VERSION || !Array.isArray(data.sourceNodes) || data.sourceNodes.length > 16 || !Array.isArray(data.argumentNodes) || data.argumentNodes.length > 16 || !Array.isArray(data.relations) || data.relations.length > 28 || !Array.isArray(data.rejectedNodes) || data.rejectedNodes.length > 16) throw new Error('INVALID_RESPONSE');
  const sourceIds = new Set<string>();
  const sourceNodes = data.sourceNodes.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>, sourceNodeId = clean(item.sourceNodeId, 80), sourceQuote = clean(item.sourceQuote, 2000), type = item.type as ArgumentNodeType;
    if (Object.keys(item).some(key => !['sourceNodeId', 'type', 'sourceQuote'].includes(key)) || !NODE_TYPES.has(type) || sourceIds.has(sourceNodeId) || !snapshot.includes(sourceQuote)) throw new Error('INVALID_RESPONSE');
    sourceIds.add(sourceNodeId); return { sourceNodeId, type, sourceQuote };
  });
  const nodeTypes = new Map<string, ArgumentNodeType>();
  const argumentNodes = data.argumentNodes.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>, nodeId = clean(item.nodeId, 240), type = item.type as ArgumentNodeType;
    const optional = (value: unknown, max: number) => value === null ? null : clean(value, max);
    if (Object.keys(item).some(key => !['nodeId', 'type', 'normalizedZh', 'normalizedEn', 'usageScope', 'conditions', 'sourceNodeIds'].includes(key)) || !NODE_TYPES.has(type) || nodeTypes.has(nodeId) || !Array.isArray(item.conditions) || item.conditions.length > 3 || !Array.isArray(item.sourceNodeIds) || !item.sourceNodeIds.length || item.sourceNodeIds.length > 4) throw new Error('INVALID_RESPONSE');
    const normalizedZh = meaning(item.normalizedZh, 600), normalizedEn = optional(item.normalizedEn, 700), usageScope = optional(item.usageScope, 500), conditions = item.conditions.map(value => meaning(value, 300)), sourceNodeIds = item.sourceNodeIds.map(value => clean(value, 80));
    if (normalizedEn && chinese(normalizedEn) || usageScope && !chinese(usageScope) || new Set(sourceNodeIds).size !== sourceNodeIds.length || sourceNodeIds.some(id => !sourceIds.has(id))) throw new Error('INVALID_RESPONSE');
    nodeTypes.set(nodeId, type); return { nodeId, type, normalizedZh, normalizedEn, usageScope, conditions, sourceNodeIds };
  });
  if ((argumentNodes.length && !argumentNodes.some(node => node.type === 'claim')) || (!argumentNodes.length && sourceNodes.length !== data.rejectedNodes.length)) throw new Error('INVALID_RESPONSE');
  const relationKeys = new Set<string>();
  const relations = data.relations.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>, fromNodeId = clean(item.fromNodeId, 240), toNodeId = clean(item.toNodeId, 240), type = item.type as ArgumentRelationType, key = `${fromNodeId}:${type}:${toNodeId}`;
    if (Object.keys(item).some(keyName => !['fromNodeId', 'toNodeId', 'type'].includes(keyName)) || !RELATION_TYPES.has(type) || fromNodeId === toNodeId || relationKeys.has(key) || !nodeTypes.has(fromNodeId) || !nodeTypes.has(toNodeId) || !allowedRelation(nodeTypes.get(fromNodeId)!, type, nodeTypes.get(toNodeId)!)) throw new Error('INVALID_RESPONSE');
    relationKeys.add(key); return { fromNodeId, toNodeId, type };
  });
  const relatedFrom = new Set(relations.map(relation => relation.fromNodeId));
  if (argumentNodes.some(node => node.type !== 'claim' && !relatedFrom.has(node.nodeId))) throw new Error('INVALID_RESPONSE');
  const rejectedIds = new Set<string>();
  const rejectedNodes = data.rejectedNodes.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>, sourceNodeId = clean(item.sourceNodeId, 80), reasonZh = meaning(item.reasonZh, 400);
    if (Object.keys(item).some(key => !['sourceNodeId', 'reasonZh'].includes(key)) || !sourceIds.has(sourceNodeId) || rejectedIds.has(sourceNodeId) || argumentNodes.some(node => node.sourceNodeIds.includes(sourceNodeId))) throw new Error('INVALID_RESPONSE');
    rejectedIds.add(sourceNodeId); return { sourceNodeId, reasonZh };
  });
  let transferStructure: ArgumentTransferStructure | null | undefined;
  if (Object.hasOwn(data, 'transferStructure')) {
    if (data.transferStructure === null) transferStructure = null;
    else {
      if (!data.transferStructure || typeof data.transferStructure !== 'object') throw new Error('INVALID_RESPONSE');
      const raw = data.transferStructure as Record<string, unknown>;
      const current = Object.hasOwn(raw, 'triggerZh');
      const allowed = current ? ['triggerZh', 'reasoningZh', 'adaptableRoles', 'failureConditions'] : ['principleZh', 'mechanismZh', 'conditions', 'adaptableRoles'];
      const limits = current ? raw.failureConditions : raw.conditions;
      if (Object.keys(raw).some(key => !allowed.includes(key)) || !Array.isArray(limits) || limits.length > 6 || !Array.isArray(raw.adaptableRoles) || raw.adaptableRoles.length > 8) throw new Error('INVALID_RESPONSE');
      const adaptableRoles = raw.adaptableRoles.map(value => {
        if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
        const role = value as Record<string, unknown>;
        if (Object.keys(role).some(key => !['roleZh', 'sourceValueZh'].includes(key))) throw new Error('INVALID_RESPONSE');
        return { roleZh: meaning(role.roleZh, 120), sourceValueZh: meaning(role.sourceValueZh, 240) };
      });
      if (new Set(adaptableRoles.map(item => item.roleZh)).size !== adaptableRoles.length) throw new Error('INVALID_RESPONSE');
      transferStructure = current
        ? { triggerZh: meaning(raw.triggerZh, 700), reasoningZh: meaning(raw.reasoningZh, 1000), adaptableRoles, failureConditions: limits.map(value => meaning(value, 300)) }
        : { principleZh: meaning(raw.principleZh, 700), mechanismZh: raw.mechanismZh === null ? null : meaning(raw.mechanismZh, 700), conditions: limits.map(value => meaning(value, 300)), adaptableRoles };
    }
  }
  if ((argumentNodes.some(node => node.type === 'claim') && transferStructure === null) || (!argumentNodes.length && transferStructure)) throw new Error('INVALID_RESPONSE');
  return { sourceNodes, argumentNodes, relations, rejectedNodes, ...(transferStructure !== undefined ? { transferStructure } : {}) };
}

export function readTopicAssetCandidate(value: unknown, snapshot: string, allowDraftMeanings = false): TopicAssetCandidate {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const data = value as Record<string, unknown>;
  const hasNewExpressions = Object.hasOwn(data, 'languageExpressions');
  const hasLegacyCollocations = Object.hasOwn(data, 'collocations');
  const graph = data.schemaVersion === ARGUMENT_SCHEMA_VERSION, thoughtSchema = data.schemaVersion === THOUGHT_SCHEMA_VERSION;
  if (Object.keys(data).some(key => !['topicTags', 'viewpoint', 'reasons', 'exampleIdea', 'languageExpressions', 'collocations', 'schemaVersion', 'sourceNodes', 'argumentNodes', 'relations', 'rejectedNodes', 'transferStructure', 'thought'].includes(key)) || hasNewExpressions === hasLegacyCollocations || !Array.isArray(data.topicTags) || data.topicTags.length > 6 || !Array.isArray(data.reasons) || data.reasons.length > 2) throw new Error('INVALID_RESPONSE');
  const topicTags = data.topicTags.map(tag => clean(tag, 60));
  if (new Set(topicTags.map(tag => tag.toLowerCase())).size !== topicTags.length) throw new Error('INVALID_RESPONSE');
  const meaning = (value: unknown, max: number) => {
    if (allowDraftMeanings) {
      if (typeof value !== 'string' || value.length > max) throw new Error('INVALID_RESPONSE');
      return value;
    }
    const result = clean(value, max);
    if (!chinese(result)) throw new Error('INVALID_RESPONSE');
    return result;
  };

  let viewpoint: TopicAssetCandidate['viewpoint'] = null;
  if (data.viewpoint !== null) {
    if (!data.viewpoint || typeof data.viewpoint !== 'object') throw new Error('INVALID_RESPONSE');
    const raw = data.viewpoint as Record<string, unknown>;
    const textEn = clean(raw.textEn, 600), meaningZh = meaning(raw.meaningZh, 500), sourceQuote = clean(raw.sourceQuote, 2000);
    if (!snapshot.includes(sourceQuote) || !sourceQuote.includes(textEn) || chinese(textEn)) throw new Error('INVALID_RESPONSE');
    viewpoint = { textEn, meaningZh, sourceQuote };
  }

  const reasons = data.reasons.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>, summaryZh = meaning(item.summaryZh, 500), sourceQuote = clean(item.sourceQuote, 2000);
    if (!snapshot.includes(sourceQuote)) throw new Error('INVALID_RESPONSE');
    return { summaryZh, sourceQuote };
  });

  let exampleIdea: TopicAssetCandidate['exampleIdea'] = null;
  if (data.exampleIdea !== null) {
    if (!data.exampleIdea || typeof data.exampleIdea !== 'object') throw new Error('INVALID_RESPONSE');
    const raw = data.exampleIdea as Record<string, unknown>, summaryZh = meaning(raw.summaryZh, 500);
    if (!(raw.sourceQuote === null || typeof raw.sourceQuote === 'string' && raw.sourceQuote.trim() && raw.sourceQuote.length <= 2000 && snapshot.includes(raw.sourceQuote))) throw new Error('INVALID_RESPONSE');
    exampleIdea = { summaryZh, sourceQuote: raw.sourceQuote === null ? null : raw.sourceQuote.trim() };
  }

  if (hasNewExpressions) {
    const languageExpressions = readTransferableExpressions(data.languageExpressions, snapshot, allowDraftMeanings);
    if (thoughtSchema) {
      if (data.topicTags.length || data.viewpoint !== null || data.reasons.length || data.exampleIdea !== null || !Object.hasOwn(data, 'thought') || Object.hasOwn(data, 'sourceNodes') || Object.hasOwn(data, 'argumentNodes') || Object.hasOwn(data, 'relations') || Object.hasOwn(data, 'rejectedNodes') || Object.hasOwn(data, 'transferStructure') || languageExpressions.some(expression => expression.attachedToNodeIds?.length)) throw new Error('INVALID_RESPONSE');
      let thought: ThoughtAssetCandidate | null = null;
      if (data.thought !== null) {
        if (!data.thought || typeof data.thought !== 'object') throw new Error('INVALID_RESPONSE');
        const raw = data.thought as Record<string, unknown>;
        if (Object.keys(raw).some(key => !['thought', 'useWhen', 'rationale', 'limits', 'sourceQuotes'].includes(key)) || !Array.isArray(raw.limits) || raw.limits.length > 6 || !Array.isArray(raw.sourceQuotes) || !raw.sourceQuotes.length || raw.sourceQuotes.length > 4) throw new Error('INVALID_RESPONSE');
        const nullable = (item: unknown, max: number) => item === null ? null : meaning(item, max);
        const sourceQuotes = raw.sourceQuotes.map(item => clean(item, 2000));
        if (new Set(sourceQuotes).size !== sourceQuotes.length || sourceQuotes.some(quote => !snapshot.includes(quote))) throw new Error('INVALID_RESPONSE');
        thought = { thought: meaning(raw.thought, 800), useWhen: nullable(raw.useWhen, 600), rationale: nullable(raw.rationale, 1000), limits: raw.limits.map(item => meaning(item, 300)), sourceQuotes };
      }
      return { topicTags, viewpoint, reasons, exampleIdea, languageExpressions, schemaVersion: THOUGHT_SCHEMA_VERSION, thought };
    }
    if (!graph) return { topicTags, viewpoint, reasons, exampleIdea, languageExpressions };
    if (topicTags.length || viewpoint || reasons.length || exampleIdea) throw new Error('INVALID_RESPONSE');
    const argumentGraph = readArgumentGraph(data, snapshot, meaning);
    const nodeIds = new Set(argumentGraph.argumentNodes.map(node => node.nodeId));
    if (languageExpressions.some(expression => !expression.attachedToNodeIds?.length || expression.attachedToNodeIds.some(id => !nodeIds.has(id) || !['claim', 'reason'].includes(argumentGraph.argumentNodes.find(node => node.nodeId === id)!.type)))) throw new Error('INVALID_RESPONSE');
    return { topicTags, viewpoint, reasons, exampleIdea, languageExpressions, schemaVersion: ARGUMENT_SCHEMA_VERSION, ...argumentGraph };
  }
  if (!isLegacyCollocations(data.collocations, snapshot, allowDraftMeanings)) throw new Error('INVALID_RESPONSE');
  const collocations = data.collocations.map(item => ({ ...item, meaningZh: meaning(item.meaningZh, 300) }));
  return { topicTags, viewpoint, reasons, exampleIdea, collocations };
}

function revisionOf(pack: TopicAssetPack): TopicAssetRevision {
  return {
    sourceTitle: pack.sourceTitle,
    sourcePrompt: pack.sourcePrompt,
    sourceEssaySnapshot: pack.sourceEssaySnapshot,
    sourceEssayHash: pack.sourceEssayHash,
    revision: pack.revision,
    savedAt: pack.savedAt,
    topicTags: pack.topicTags,
    viewpoint: pack.viewpoint,
    reasons: pack.reasons,
    exampleIdea: pack.exampleIdea,
    ...(pack.languageExpressions ? { languageExpressions: pack.languageExpressions } : { collocations: pack.collocations ?? [] }),
    ...(pack.schemaVersion === ARGUMENT_SCHEMA_VERSION ? { schemaVersion: ARGUMENT_SCHEMA_VERSION, sourceNodes: pack.sourceNodes, argumentNodes: pack.argumentNodes, relations: pack.relations, rejectedNodes: pack.rejectedNodes, ...(pack.transferStructure !== undefined ? { transferStructure: pack.transferStructure } : {}) } : pack.schemaVersion === THOUGHT_SCHEMA_VERSION ? { schemaVersion: THOUGHT_SCHEMA_VERSION, thought: pack.thought ?? null } : {}),
    extractionMeta: pack.extractionMeta,
    ...(pack.completion ? { completion: pack.completion } : {}),
  };
}

function candidateOf(value: TopicAssetCandidate) {
  const base = {
    topicTags: value.topicTags, viewpoint: value.viewpoint, reasons: value.reasons, exampleIdea: value.exampleIdea,
    ...(value.languageExpressions ? { languageExpressions: value.languageExpressions.map(({ expression, meaningZh, pattern, usageScope, sourceForm, sourceQuote, attachedToNodeIds }) => ({ expression, meaningZh, pattern, usageScope, sourceForm, sourceQuote, ...(attachedToNodeIds ? { attachedToNodeIds } : {}) })) } : { collocations: value.collocations ?? [] }),
  };
  if (value.schemaVersion === THOUGHT_SCHEMA_VERSION) return { ...base, schemaVersion: THOUGHT_SCHEMA_VERSION, thought: value.thought ?? null };
  if (value.schemaVersion !== ARGUMENT_SCHEMA_VERSION) return base;
  return { ...base, schemaVersion: ARGUMENT_SCHEMA_VERSION, sourceNodes: value.sourceNodes, argumentNodes: value.argumentNodes?.map(({ nodeId, type, normalizedZh, normalizedEn, usageScope, conditions, sourceNodeIds }) => ({ nodeId, type, normalizedZh, normalizedEn, usageScope, conditions, sourceNodeIds })), relations: value.relations, rejectedNodes: value.rejectedNodes, ...(value.transferStructure !== undefined ? { transferStructure: value.transferStructure } : {}) };
}

export function topicAssetItemCount(candidate: TopicAssetCandidate) {
  if (candidate.schemaVersion === THOUGHT_SCHEMA_VERSION) return Number(!!candidate.thought) + (candidate.languageExpressions?.length ?? 0);
  if (candidate.schemaVersion === ARGUMENT_SCHEMA_VERSION) return (candidate.argumentNodes?.length ?? 0) + (candidate.languageExpressions?.length ?? 0);
  return Number(!!candidate.viewpoint) + candidate.reasons.length + Number(!!candidate.exampleIdea) + (candidate.languageExpressions?.length ?? candidate.collocations?.length ?? 0);
}

export function isArgumentGraphAsset(candidate: TopicAssetCandidate): candidate is TopicAssetCandidate & Required<Pick<TopicAssetCandidate, 'schemaVersion' | 'sourceNodes' | 'argumentNodes' | 'relations' | 'rejectedNodes'>> {
  return candidate.schemaVersion === ARGUMENT_SCHEMA_VERSION;
}

export function isThoughtAssetCandidate(candidate: TopicAssetCandidate): candidate is TopicAssetCandidate & { schemaVersion: typeof THOUGHT_SCHEMA_VERSION; thought: ThoughtAssetCandidate | null } {
  return candidate.schemaVersion === THOUGHT_SCHEMA_VERSION;
}

export function argumentNodeLabel(type: ArgumentNodeType) {
  return ({ claim: '观点', reason: '理由', mechanism: '因果机制', condition: '成立条件', example: '例证', counterpoint: '反方观点', response: '回应' } as const)[type];
}

export function argumentNodeEvidence(asset: Pick<TopicAssetCandidate, 'sourceNodes'>, node: ArgumentNodeCandidate) {
  const sources = new Map((asset.sourceNodes ?? []).map(source => [source.sourceNodeId, source.sourceQuote]));
  return node.sourceNodeIds.map(id => sources.get(id)).filter((quote): quote is string => !!quote);
}

export function removeArgumentNode(candidate: TopicAssetCandidate, nodeId: string): TopicAssetCandidate {
  if (!isArgumentGraphAsset(candidate)) return candidate;
  const removed = new Set([nodeId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const relation of candidate.relations) if (removed.has(relation.toNodeId) && !removed.has(relation.fromNodeId)) { removed.add(relation.fromNodeId); changed = true; }
  }
  const argumentNodes = candidate.argumentNodes.filter(node => !removed.has(node.nodeId));
  const usedSources = new Set(argumentNodes.flatMap(node => node.sourceNodeIds));
  return {
    ...candidate,
    argumentNodes,
    sourceNodes: candidate.sourceNodes.filter(source => usedSources.has(source.sourceNodeId) || candidate.rejectedNodes.some(rejected => rejected.sourceNodeId === source.sourceNodeId)),
    relations: candidate.relations.filter(relation => !removed.has(relation.fromNodeId) && !removed.has(relation.toNodeId)),
    languageExpressions: candidate.languageExpressions?.map(expression => ({ ...expression, attachedToNodeIds: expression.attachedToNodeIds?.filter(id => !removed.has(id)) })).filter(expression => expression.attachedToNodeIds?.length),
    ...(argumentNodes.some(node => node.type === 'claim') ? {} : { transferStructure: null }),
  };
}

export function topicLanguageExpressions(candidate: Pick<TopicAssetCandidate, 'languageExpressions' | 'collocations'>) {
  return candidate.languageExpressions?.map(item => ({ ...item, legacy: false as const }))
    ?? candidate.collocations?.map(item => ({ ...item, pattern: null, usageScope: null, sourceForm: item.expression, legacy: true as const }))
    ?? [];
}

function validCompletion(value: NonNullable<TopicAssetRevision['completion']>) {
  return !!value && typeof value.versionId === 'string' && !!value.versionId.trim() && value.versionId.length <= 200
    && typeof value.confirmedAt === 'string' && value.confirmedAt.length <= 100 && Number.isFinite(Date.parse(value.confirmedAt))
    && typeof value.saveReason === 'string' && value.saveReason.length <= 300;
}

function validRevision(value: TopicAssetRevision, documentId: string) {
  if (!value || typeof value.sourceTitle !== 'string' || typeof value.sourcePrompt !== 'string' || typeof value.sourceEssaySnapshot !== 'string' || !value.sourceEssaySnapshot || !/^[a-f0-9]{64}$/.test(value.sourceEssayHash) || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || !value.extractionMeta || typeof value.extractionMeta.model !== 'string' || typeof value.extractionMeta.promptVersion !== 'string' || !value.extractionMeta.promptVersion) return false;
  if (value.completion !== undefined && !validCompletion(value.completion)) return false;
  try {
    readTopicAssetCandidate(candidateOf(value), value.sourceEssaySnapshot);
    if (value.languageExpressions && (!value.completion || !value.languageExpressions.every(expression => isSavedTransferableExpression(expression, value.sourceEssaySnapshot, documentId, value.completion!.versionId)))) return false;
    return true;
  } catch { return false; }
}

export async function saveTopicAssetPack(
  packs: TopicAssetPack[],
  source: { documentId: string; sourceTitle: string; taskPrompt: string; essay: string; completion?: TopicAssetRevision['completion'] },
  candidate: TopicAssetCandidate,
  meta: { model: string; promptVersion: string },
  id: string,
  now: string,
) {
  const sourceEssayHash = await textHash(source.essay);
  const old = packs.find(pack => pack.sourceDocumentId === source.documentId);
  if (old?.sourceEssayHash === sourceEssayHash) return { packs, pack: old, outcome: 'unchanged' as const };
  readTopicAssetCandidate(candidateOf(candidate), source.essay);
  if (!topicAssetItemCount(candidate)) throw new Error('EMPTY_CANDIDATE');
  if (source.completion !== undefined && !validCompletion(source.completion)) throw new Error('INVALID_COMPLETION');
  if (source.completion && candidate.exampleIdea && !candidate.exampleIdea.sourceQuote) throw new Error('INVALID_RESPONSE');
  if (candidate.languageExpressions) {
    if (!source.completion) throw new Error('INVALID_COMPLETION');
    if (candidate.schemaVersion !== ARGUMENT_SCHEMA_VERSION) {
      const existing = new Set(packs.filter(pack => pack.id !== old?.id).flatMap(pack => topicLanguageExpressions(pack).map(item => expressionKey(item.expression))));
      if (candidate.languageExpressions.some(item => existing.has(expressionKey(item.expression)))) throw new Error('DUPLICATE_EXPRESSION');
    }
  }
  const revision = (old?.revision ?? 0) + 1;
  const prefix = `${old?.id ?? id}:r${revision}`;
  const sourceId = new Map(candidate.sourceNodes?.map(node => [node.sourceNodeId, `${prefix}:s:${node.sourceNodeId}`]) ?? []);
  const nodeId = new Map(candidate.argumentNodes?.map(node => [node.nodeId, `${prefix}:n:${node.nodeId}`]) ?? []);
  const savedSourceNodes = candidate.sourceNodes?.map(node => ({ ...node, sourceNodeId: sourceId.get(node.sourceNodeId)! }));
  const savedArgumentNodes = candidate.argumentNodes?.map(node => ({
    ...node,
    nodeId: nodeId.get(node.nodeId)!,
    sourceNodeIds: node.sourceNodeIds.map(value => sourceId.get(value)!),
    canonicalKey: node.normalizedZh.toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]{}]/g, ''),
    sourceEvidence: node.sourceNodeIds.map(value => ({ documentId: source.documentId, revisionId: source.completion!.versionId, taskPrompt: source.taskPrompt, sourceQuote: candidate.sourceNodes!.find(item => item.sourceNodeId === value)!.sourceQuote })),
    provenance: { model: meta.model, promptVersion: meta.promptVersion },
  }));
  const next: TopicAssetPack = {
    id: old?.id ?? id,
    sourceDocumentId: source.documentId,
    sourceTitle: source.sourceTitle,
    sourcePrompt: source.taskPrompt,
    sourceEssaySnapshot: source.essay,
    sourceEssayHash,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    revision,
    savedAt: now,
    topicTags: candidate.topicTags,
    viewpoint: candidate.viewpoint,
    reasons: candidate.reasons,
    exampleIdea: candidate.exampleIdea,
    ...(candidate.languageExpressions ? { languageExpressions: candidate.languageExpressions.map((expression, index) => ({
      ...expression,
      expressionId: `${old?.id ?? id}:r${revision}:e${index + 1}`,
      ...(expression.attachedToNodeIds ? { attachedToNodeIds: expression.attachedToNodeIds.map(value => nodeId.get(value)!), attachedToOccurrenceIds: expression.attachedToNodeIds.map(value => nodeId.get(value)!) } : {}),
      sourceDocumentId: source.documentId,
      sourceRevisionId: source.completion!.versionId,
      provenance: { model: meta.model, promptVersion: meta.promptVersion },
    })) } : { collocations: candidate.collocations ?? [] }),
    ...(candidate.schemaVersion === ARGUMENT_SCHEMA_VERSION ? {
      schemaVersion: ARGUMENT_SCHEMA_VERSION,
      sourceNodes: savedSourceNodes,
      argumentNodes: savedArgumentNodes,
      relations: candidate.relations!.map(relation => ({ ...relation, fromNodeId: nodeId.get(relation.fromNodeId)!, toNodeId: nodeId.get(relation.toNodeId)! })),
      rejectedNodes: candidate.rejectedNodes!.map(rejected => ({ ...rejected, sourceNodeId: sourceId.get(rejected.sourceNodeId)! })),
      ...(candidate.transferStructure !== undefined ? { transferStructure: candidate.transferStructure } : {}),
    } : candidate.schemaVersion === THOUGHT_SCHEMA_VERSION ? { schemaVersion: THOUGHT_SCHEMA_VERSION, thought: candidate.thought ?? null } : {}),
    extractionMeta: meta,
    ...(source.completion ? { completion: { ...source.completion } } : {}),
    previousRevisions: old ? [...old.previousRevisions, revisionOf(old)] : [],
  };
  return { packs: old ? packs.map(pack => pack.id === old.id ? next : pack) : [next, ...packs], pack: next, outcome: old ? 'updated' as const : 'created' as const };
}

export function isTopicAssetPacks(value: unknown): value is TopicAssetPack[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>(), documents = new Set<string>();
  return value.every(raw => {
    if (!raw || typeof raw !== 'object') return false;
    const pack = raw as TopicAssetPack;
    if (!pack || typeof pack.id !== 'string' || !pack.id || ids.has(pack.id) || typeof pack.sourceDocumentId !== 'string' || !pack.sourceDocumentId || documents.has(pack.sourceDocumentId) || typeof pack.createdAt !== 'string' || !Number.isFinite(Date.parse(pack.createdAt)) || typeof pack.updatedAt !== 'string' || !Number.isFinite(Date.parse(pack.updatedAt)) || !Array.isArray(pack.previousRevisions) || pack.previousRevisions.length !== pack.revision - 1 || !validRevision(pack, pack.sourceDocumentId) || !pack.previousRevisions.every((revision, index) => validRevision(revision, pack.sourceDocumentId) && revision.revision === index + 1)) return false;
    ids.add(pack.id); documents.add(pack.sourceDocumentId);
    return true;
  });
}

export function recallMetadata(packs: TopicAssetPack[]) {
  return packs.map(pack => ({ assetPackId: pack.id, sourcePrompt: pack.sourcePrompt, topicTags: pack.topicTags, viewpointZh: pack.argumentNodes?.find(node => node.type === 'claim')?.normalizedZh ?? pack.viewpoint?.meaningZh ?? null, reasonsZh: pack.argumentNodes?.filter(node => node.type === 'reason').map(node => node.normalizedZh) ?? pack.reasons.map(reason => reason.summaryZh) }));
}

export function readRecallResult(value: unknown, packs: TopicAssetPack[]) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const data = value as Record<string, unknown>, allowed = new Set(packs.map(pack => pack.id)), seen = new Set<string>();
  if (data.version !== 1 || !Array.isArray(data.matches) || data.matches.length > 3 || !data.meta || typeof data.meta !== 'object') throw new Error('INVALID_RESPONSE');
  const matches = data.matches.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>;
    if (typeof item.assetPackId !== 'string' || !allowed.has(item.assetPackId) || seen.has(item.assetPackId) || typeof item.reasonZh !== 'string' || !chinese(item.reasonZh) || item.reasonZh.length > 300) throw new Error('INVALID_RESPONSE');
    seen.add(item.assetPackId);
    return { assetPackId: item.assetPackId, reasonZh: item.reasonZh.trim() };
  });
  const meta = data.meta as Record<string, unknown>;
  if (meta.promptVersion !== RECALL_PROMPT_VERSION || ![0, 1, 2].includes(Number(meta.callCount)) || !(meta.model === null || typeof meta.model === 'string') || typeof meta.latencyMs !== 'number' || meta.latencyMs < 0) throw new Error('INVALID_RESPONSE');
  return { matches, meta };
}
