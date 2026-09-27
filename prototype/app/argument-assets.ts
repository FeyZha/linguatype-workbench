import { isReusableReasoningPattern, isThoughtAssetCandidate, type TopicAssetPack, type ArgumentNode, type ArgumentNodeCandidate, type ArgumentTransferStructure, type ThoughtAssetCandidate } from './topic-assets.ts';

export type ArgumentOccurrence = {
  occurrenceId: string;
  type: ArgumentNodeCandidate['type'];
  normalizedZh: string;
  normalizedEn?: string;
  usageScope?: string;
  conditions?: string[];
  sourceNodeIds: string[];
  sourceDocumentId: string;
  sourceRevisionId: string;
  stableKey?: string;
  createdAt: string;
};

export type LegacyArgumentAsset = {
  assetId: string;
  kind: 'claim';
  claimZh: string;
  claimEn?: string;
  usageScope?: string;
  conditions?: string[];
  status: 'active' | 'archived';
  occurrenceIds: string[];
  reasonOccurrenceIds?: string[];
  expressionIds?: string[];
  canonicalKey?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  usageCount: number;
  abstraction?: ArgumentTransferStructure & { revision: number; basedOnOccurrenceIds: string[]; updatedAt: string };
  abstractionHistory?: Array<ArgumentTransferStructure & { revision: number; basedOnOccurrenceIds: string[]; updatedAt: string }>;
};

export type ThoughtSourceEvidence = {
  documentId: string;
  revisionId: string;
  sourceTitle: string;
  taskPrompt: string;
  quote: string;
};

export type ThoughtAsset = {
  assetId: string;
  kind: 'thought';
  thought: string;
  useWhen?: string;
  rationale?: string;
  limits?: string[];
  sources: ThoughtSourceEvidence[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  usageCount: number;
  history?: Array<{ thought: string; useWhen?: string; rationale?: string; limits?: string[]; updatedAt: string }>;
};

export type ArgumentAsset = LegacyArgumentAsset | ThoughtAsset;
export type ThoughtAssetUpdate = Pick<ThoughtAsset, 'thought' | 'useWhen' | 'rationale' | 'limits'>;

export type ArgumentAssetDecision = { action: 'new' | 'link' | 'replace' | 'skip'; assetId?: string };
export type ArgumentRoleMapping = { roleZh: string; sourceValueZh: string; currentValueZh: string };
export type ArgumentReuseContext = { transferReasonZh: string; roleMappings: ArgumentRoleMapping[]; conditionsToRecheck: string[]; nonTransferable: string[] };
export type ArgumentAssetReuseDraft = { assetId: string; addedAt: string; transfer?: ArgumentReuseContext };
export type ArgumentAssetUsage = {
  usageId: string;
  assetId: string;
  documentId: string;
  revisionId: string;
  usedOccurrenceId?: string;
  usageType: 'reused' | 'adapted';
  usedAt: string;
};

const date = (value: unknown) => typeof value === 'string' && value.length <= 100 && Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number, required = true): value is string => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const strings = (value: unknown, maxItems: number, maxLength: number) => Array.isArray(value) && value.length <= maxItems && new Set(value).size === value.length && value.every(item => text(item, maxLength));
const validTransferStructure = (value: unknown, revision = false) => {
  if (!value || typeof value !== 'object') return false;
  const raw = value as ArgumentTransferStructure & { revision?: number; basedOnOccurrenceIds?: string[]; updatedAt?: string };
  const contentValid = isReusableReasoningPattern(raw)
    ? text(raw.triggerZh, 700) && /[\u3400-\u9fff]/.test(raw.triggerZh) && text(raw.reasoningZh, 1000) && /[\u3400-\u9fff]/.test(raw.reasoningZh) && strings(raw.failureConditions, 6, 300)
    : text(raw.principleZh, 700) && /[\u3400-\u9fff]/.test(raw.principleZh) && (raw.mechanismZh === null || text(raw.mechanismZh, 700) && /[\u3400-\u9fff]/.test(raw.mechanismZh)) && strings(raw.conditions, 6, 300);
  return contentValid && Array.isArray(raw.adaptableRoles) && raw.adaptableRoles.length <= 8 && new Set(raw.adaptableRoles.map(item => item?.roleZh)).size === raw.adaptableRoles.length
    && raw.adaptableRoles.every(item => item && text(item.roleZh, 120) && text(item.sourceValueZh, 240) && /[\u3400-\u9fff]/.test(item.roleZh) && /[\u3400-\u9fff]/.test(item.sourceValueZh))
    && (!revision || Number.isSafeInteger(raw.revision) && raw.revision! >= 1 && strings(raw.basedOnOccurrenceIds, 1000, 240) && !!raw.basedOnOccurrenceIds?.length && date(raw.updatedAt));
};

export function isArgumentAssets(value: unknown): value is ArgumentAsset[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  return value.every((raw: ArgumentAsset) => {
    if (!raw || typeof raw !== 'object' || !text(raw.assetId, 200) || ids.has(raw.assetId) || !['active', 'archived'].includes(raw.status) || !date(raw.createdAt) || !date(raw.updatedAt) || !(raw.lastUsedAt === undefined || date(raw.lastUsedAt)) || !Number.isSafeInteger(raw.usageCount) || raw.usageCount < 0) return false;
    if (raw.kind === 'thought') {
      if (!text(raw.thought, 800) || !/[\u3400-\u9fff]/.test(raw.thought) || !(raw.useWhen === undefined || text(raw.useWhen, 600)) || !(raw.rationale === undefined || text(raw.rationale, 1000)) || !(raw.limits === undefined || strings(raw.limits, 6, 300)) || !Array.isArray(raw.sources) || !raw.sources.length || raw.sources.length > 1000 || !raw.sources.every(source => source && text(source.documentId, 200) && text(source.revisionId, 200) && text(source.sourceTitle, 4000) && text(source.taskPrompt, 4000) && text(source.quote, 2000)) || !(raw.history === undefined || Array.isArray(raw.history) && raw.history.length <= 100 && raw.history.every(item => item && text(item.thought, 800) && !(item.useWhen !== undefined && !text(item.useWhen, 600)) && !(item.rationale !== undefined && !text(item.rationale, 1000)) && !(item.limits !== undefined && !strings(item.limits, 6, 300)) && date(item.updatedAt)))) return false;
    } else if (raw.kind !== 'claim' || !text(raw.claimZh, 600) || !(raw.claimEn === undefined || text(raw.claimEn, 700)) || !(raw.usageScope === undefined || text(raw.usageScope, 500, false)) || !(raw.conditions === undefined || strings(raw.conditions, 8, 300)) || !strings(raw.occurrenceIds, 1000, 240) || !raw.occurrenceIds.length || !(raw.reasonOccurrenceIds === undefined || strings(raw.reasonOccurrenceIds, 1000, 240)) || !(raw.expressionIds === undefined || strings(raw.expressionIds, 1000, 240)) || !(raw.canonicalKey === undefined || text(raw.canonicalKey, 700)) || !(raw.abstraction === undefined || validTransferStructure(raw.abstraction, true)) || !(raw.abstractionHistory === undefined || Array.isArray(raw.abstractionHistory) && raw.abstractionHistory.length <= 100 && raw.abstractionHistory.every(item => validTransferStructure(item, true)))) return false;
    ids.add(raw.assetId); return true;
  });
}

export function isArgumentAssetUsages(value: unknown, assets?: ArgumentAsset[]): value is ArgumentAssetUsage[] {
  if (!Array.isArray(value) || value.length > 10000) return false;
  const ids = new Set<string>(), keys = new Set<string>(), allowed = assets ? new Set(assets.map(asset => asset.assetId)) : null;
  return value.every((raw: ArgumentAssetUsage) => {
    const key = `${raw?.assetId}:${raw?.documentId}:${raw?.revisionId}`;
    if (!raw || typeof raw !== 'object' || !text(raw.usageId, 300) || ids.has(raw.usageId) || !text(raw.assetId, 200) || allowed && !allowed.has(raw.assetId) || !text(raw.documentId, 200) || !text(raw.revisionId, 200) || !(raw.usedOccurrenceId === undefined || text(raw.usedOccurrenceId, 240)) || !['reused', 'adapted'].includes(raw.usageType) || !date(raw.usedAt) || keys.has(key)) return false;
    ids.add(raw.usageId); keys.add(key); return true;
  });
}

export function isArgumentReuseDrafts(value: unknown): value is ArgumentAssetReuseDraft[] {
  return Array.isArray(value) && value.length <= 100 && new Set(value.map(item => item?.assetId)).size === value.length && value.every(item => item && text(item.assetId, 200) && date(item.addedAt) && (item.transfer === undefined || validReuseContext(item.transfer)));
}

export function validReuseContext(value: unknown): value is ArgumentReuseContext {
  if (!value || typeof value !== 'object') return false;
  const raw = value as ArgumentReuseContext;
  return text(raw.transferReasonZh, 500) && /[\u3400-\u9fff]/.test(raw.transferReasonZh) && strings(raw.conditionsToRecheck, 8, 300) && strings(raw.nonTransferable, 8, 300)
    && Array.isArray(raw.roleMappings) && raw.roleMappings.length <= 8 && raw.roleMappings.every(item => item && text(item.roleZh, 120) && text(item.sourceValueZh, 240) && text(item.currentValueZh, 240) && /[\u3400-\u9fff]/.test(`${item.roleZh}${item.sourceValueZh}${item.currentValueZh}`));
}

export function isArgumentAssetDecision(value: unknown): value is ArgumentAssetDecision {
  if (!value || typeof value !== 'object') return false;
  const decision = value as ArgumentAssetDecision;
  return ['new', 'link', 'replace', 'skip'].includes(decision.action)
    && (['link', 'replace'].includes(decision.action) ? text(decision.assetId, 200) : decision.assetId === undefined);
}

/** The saved ArgumentNode is one occurrence in one confirmed revision, never the long-term asset itself. */
export function occurrenceFromNode(pack: TopicAssetPack, node: ArgumentNode): ArgumentOccurrence {
  return {
    occurrenceId: node.nodeId, type: node.type, normalizedZh: node.normalizedZh,
    ...(node.normalizedEn ? { normalizedEn: node.normalizedEn } : {}),
    ...(node.usageScope ? { usageScope: node.usageScope } : {}),
    ...(node.conditions.length ? { conditions: [...node.conditions] } : {}),
    sourceNodeIds: [...node.sourceNodeIds], sourceDocumentId: pack.sourceDocumentId,
    sourceRevisionId: pack.completion?.versionId ?? `pack:${pack.id}:r${pack.revision}`,
    stableKey: node.canonicalKey, createdAt: pack.savedAt,
  };
}

function branch(pack: TopicAssetPack, claimId: string) {
  const ids = new Set([claimId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const relation of pack.relations ?? []) if (ids.has(relation.toNodeId) && !ids.has(relation.fromNodeId)) { ids.add(relation.fromNodeId); changed = true; }
  }
  return ids;
}

export function applyArgumentAssetDecision(assets: ArgumentAsset[], pack: TopicAssetPack, decision: ArgumentAssetDecision, newAssetId: string, now: string) {
  if (isThoughtAssetCandidate(pack)) {
    const candidate = pack.thought;
    if (!candidate || decision.action === 'skip') return { assets, asset: null as ArgumentAsset | null };
    const sources = candidate.sourceQuotes.map(quote => ({ documentId: pack.sourceDocumentId, revisionId: pack.completion?.versionId ?? `pack:${pack.id}:r${pack.revision}`, sourceTitle: pack.sourceTitle, taskPrompt: pack.sourcePrompt, quote }));
    if (decision.action === 'new') {
      if (assets.length >= 1000) throw new Error('长期思维资产已达上限。');
      const asset: ThoughtAsset = { assetId: newAssetId, kind: 'thought', thought: candidate.thought, ...(candidate.useWhen ? { useWhen: candidate.useWhen } : {}), ...(candidate.rationale ? { rationale: candidate.rationale } : {}), ...(candidate.limits.length ? { limits: [...candidate.limits] } : {}), sources, status: 'active', createdAt: now, updatedAt: now, usageCount: 0 };
      if (!isArgumentAssets([asset])) throw new Error('INVALID_ARGUMENT_ASSET');
      return { assets: [asset, ...assets], asset };
    }
    const current = assets.find((asset): asset is ThoughtAsset => asset.assetId === decision.assetId && asset.status === 'active' && asset.kind === 'thought');
    if (!current) throw new Error('要关联的思维资产已不存在或属于旧版。');
    const sourceKeys = new Set(current.sources.map(source => `${source.documentId}:${source.revisionId}:${source.quote}`));
    const asset: ThoughtAsset = {
      ...current,
      ...(decision.action === 'replace' ? {
        thought: candidate.thought, useWhen: candidate.useWhen || undefined, rationale: candidate.rationale || undefined, limits: candidate.limits.length ? [...candidate.limits] : undefined,
        history: [...(current.history ?? []), { thought: current.thought, ...(current.useWhen ? { useWhen: current.useWhen } : {}), ...(current.rationale ? { rationale: current.rationale } : {}), ...(current.limits?.length ? { limits: [...current.limits] } : {}), updatedAt: current.updatedAt }],
      } : {}),
      sources: [...current.sources, ...sources.filter(source => !sourceKeys.has(`${source.documentId}:${source.revisionId}:${source.quote}`))],
      updatedAt: now,
    };
    return { assets: assets.map(item => item.assetId === asset.assetId ? asset : item), asset };
  }
  const claim = pack.argumentNodes?.find(node => node.type === 'claim');
  if (!claim || decision.action === 'skip') return { assets, asset: null as ArgumentAsset | null };
  const included = branch(pack, claim.nodeId);
  const reasons = pack.argumentNodes?.filter(node => node.nodeId !== claim.nodeId && included.has(node.nodeId)).map(node => node.nodeId) ?? [];
  const expressions = pack.languageExpressions?.filter(item => item.attachedToNodeIds?.some(id => included.has(id))).map(item => item.expressionId) ?? [];
  if (decision.action === 'new') {
    if (assets.length >= 1000) throw new Error('长期思维资产已达上限。');
    const asset: ArgumentAsset = { assetId: newAssetId, kind: 'claim', claimZh: claim.normalizedZh, ...(claim.normalizedEn ? { claimEn: claim.normalizedEn } : {}), ...(claim.usageScope ? { usageScope: claim.usageScope } : {}), ...(claim.conditions.length ? { conditions: [...claim.conditions] } : {}), status: 'active', occurrenceIds: [claim.nodeId], ...(reasons.length ? { reasonOccurrenceIds: reasons } : {}), ...(expressions.length ? { expressionIds: expressions } : {}), ...(pack.transferStructure ? { abstraction: { ...pack.transferStructure, revision: 1, basedOnOccurrenceIds: [claim.nodeId], updatedAt: now } } : {}), canonicalKey: claim.canonicalKey, createdAt: now, updatedAt: now, usageCount: 0 };
    if (!isArgumentAssets([asset])) throw new Error('INVALID_ARGUMENT_ASSET');
    return { assets: [asset, ...assets], asset };
  }
  const current = assets.find((asset): asset is LegacyArgumentAsset => asset.kind === 'claim' && asset.assetId === decision.assetId && asset.status === 'active');
  if (!current) throw new Error('要关联的思维资产已不存在。');
  const asset: ArgumentAsset = {
    ...current,
    ...(decision.action === 'replace' ? { claimZh: claim.normalizedZh, claimEn: claim.normalizedEn ?? undefined, usageScope: claim.usageScope ?? undefined, conditions: claim.conditions.length ? [...claim.conditions] : undefined, canonicalKey: claim.canonicalKey } : {}),
    ...(decision.action === 'replace' && pack.transferStructure ? {
      abstraction: { ...pack.transferStructure, revision: (current.abstraction?.revision ?? 0) + 1, basedOnOccurrenceIds: [...new Set([...(current.abstraction?.basedOnOccurrenceIds ?? []), claim.nodeId])], updatedAt: now },
      ...(current.abstraction ? { abstractionHistory: [...(current.abstractionHistory ?? []), current.abstraction] } : {}),
    } : {}),
    occurrenceIds: [...new Set([...current.occurrenceIds, claim.nodeId])],
    reasonOccurrenceIds: [...new Set([...(current.reasonOccurrenceIds ?? []), ...reasons])],
    expressionIds: [...new Set([...(current.expressionIds ?? []), ...expressions])],
    updatedAt: now,
  };
  return { assets: assets.map(item => item.assetId === asset.assetId ? asset : item), asset };
}

export function argumentAssetPrinciple(asset: ArgumentAsset) {
  if (asset.kind === 'thought') return asset.thought;
  if (!asset.abstraction) return asset.claimZh;
  return isReusableReasoningPattern(asset.abstraction) ? asset.abstraction.reasoningZh : asset.abstraction.principleZh;
}

export function attachAssetToPackExpressions(pack: TopicAssetPack, asset: ArgumentAsset | null): TopicAssetPack {
  if (!asset || !pack.languageExpressions) return pack;
  if (asset.kind === 'thought') return { ...pack, languageExpressions: pack.languageExpressions.map(expression => ({ ...expression, attachedToAssetIds: [...new Set([...(expression.attachedToAssetIds ?? []), asset.assetId])] })) };
  if (!asset.expressionIds?.length) return pack;
  const ids = new Set(asset.expressionIds);
  return { ...pack, languageExpressions: pack.languageExpressions.map(expression => ids.has(expression.expressionId) ? { ...expression, attachedToAssetIds: [...new Set([...(expression.attachedToAssetIds ?? []), asset.assetId])] } : expression) };
}

export function recordArgumentAssetUsage(assets: ArgumentAsset[], usages: ArgumentAssetUsage[], value: Omit<ArgumentAssetUsage, 'usageId'>, usageId: string) {
  const key = `${value.assetId}:${value.documentId}:${value.revisionId}`;
  if (usages.some(item => `${item.assetId}:${item.documentId}:${item.revisionId}` === key)) return { assets, usages, created: false as const };
  if (!assets.some(asset => asset.assetId === value.assetId && asset.status === 'active')) throw new Error('观点已不存在。');
  const usage = { ...value, usageId };
  if (!isArgumentAssetUsages([usage])) throw new Error('INVALID_ARGUMENT_USAGE');
  return {
    usages: [...usages, usage], created: true as const,
    assets: assets.map(asset => asset.assetId === value.assetId ? { ...asset, usageCount: asset.usageCount + 1, lastUsedAt: value.usedAt, updatedAt: value.usedAt } : asset),
  };
}

export function removeArgumentAsset(assets: ArgumentAsset[], usages: ArgumentAssetUsage[], assetId: string) {
  return { assets: assets.filter(asset => asset.assetId !== assetId), usages: usages.filter(usage => usage.assetId !== assetId) };
}

export function findSimilarArgumentAssets(claim: Pick<ArgumentNodeCandidate, 'normalizedZh' | 'usageScope' | 'conditions'>, assets: ArgumentAsset[], limit = 3) {
  const key = claim.normalizedZh.toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]{}]/g, '');
  return assets.filter((asset): asset is LegacyArgumentAsset => asset.kind === 'claim' && asset.status === 'active' && asset.canonicalKey === key).slice(0, limit);
}

export function findSimilarThoughtAssets(candidate: ThoughtAssetCandidate, assets: ArgumentAsset[], limit = 3) {
  const key = candidate.thought.toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]{}]/g, '');
  return assets.filter((asset): asset is ThoughtAsset => asset.kind === 'thought' && asset.status === 'active' && asset.thought.toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]{}]/g, '') === key).slice(0, limit);
}

export function argumentAssetSourceDocumentIds(asset: ArgumentAsset, packs: TopicAssetPack[]) {
  if (asset.kind === 'thought') return [...new Set(asset.sources.map(source => source.documentId))];
  const ids = new Set(asset.occurrenceIds);
  return [...new Set(packs.filter(pack => pack.argumentNodes?.some(node => ids.has(node.nodeId))).map(pack => pack.sourceDocumentId))];
}
