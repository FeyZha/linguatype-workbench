import { validQualityAttempt, type QualityAttempt } from './analysis-record.ts';
import { isReasonAssets, type ReasonAsset } from './reason-chains.ts';
import { isIdeaAssets, type IdeaAsset } from './idea-assets.ts';
import type { EssayDocument } from './workspace-state';
import type { QualityInput } from './shared/asset-quality';

export type LanguageAsset = {
  assetId: string;
  revision: number;
  meaningZh: string;
  expression: string;
  conditions: string;
  sourceDocumentId: string;
  sourceCompletionId?: string;
  sourceQuote: string;
  createdAt: string;
  updatedAt: string;
  quality: 'unreviewed' | 'usable' | 'unusable' | 'unknown';
  qualityAttempt?: QualityAttempt;
  qualityReview?: { model?: string | null; revision: number; checkedAt: string; promptVersion: string };
};

export type AssetExposure = {
  sequence: number;
  assetId: string;
  assetRevision: number;
  documentId: string | null;
  level: 'chinese' | 'english' | 'source';
  content: string;
  essayBefore: string;
  shownAt: string;
};

export type AssetLibrary = { reasons?: ReasonAsset[]; ideas?: IdeaAsset[]; assets: LanguageAsset[]; exposures: AssetExposure[]; sequence: number };
export const EMPTY_ASSET_LIBRARY: AssetLibrary = { assets: [], exposures: [], sequence: 0 };

export function isAssetLibrary(value: unknown): value is AssetLibrary {
  if (!value || typeof value !== 'object') return false;
  const library = value as AssetLibrary;
  if (!Array.isArray(library.assets) || !Array.isArray(library.exposures) || !Number.isSafeInteger(library.sequence) || library.sequence < 0) return false;
  const ids = new Set<string>();
  for (const asset of library.assets) {
    if (!asset || !['assetId', 'meaningZh', 'expression', 'conditions', 'sourceDocumentId', 'sourceQuote', 'createdAt', 'updatedAt'].every(key => typeof asset[key as keyof LanguageAsset] === 'string') || !asset.assetId || ids.has(asset.assetId) || !Number.isSafeInteger(asset.revision) || asset.revision < 1 || !['unreviewed', 'usable', 'unusable', 'unknown'].includes(asset.quality)) return false;
    if (asset.quality !== 'unreviewed' && (!asset.qualityReview || asset.qualityReview.revision !== asset.revision || typeof asset.qualityReview.checkedAt !== 'string' || !Number.isFinite(Date.parse(asset.qualityReview.checkedAt)) || asset.qualityReview.promptVersion !== 'vnext-asset-quality-v1-source-meaning')) return false;
    if (!validQualityAttempt(asset)) return false;
    if (asset.qualityReview?.model !== undefined && !(asset.qualityReview.model === null || typeof asset.qualityReview.model === 'string' && !!asset.qualityReview.model && asset.qualityReview.model.length <= 200)) return false;
    if (asset.sourceCompletionId !== undefined && typeof asset.sourceCompletionId !== 'string') return false;
    ids.add(asset.assetId);
  }
  if (library.ideas !== undefined && (!isIdeaAssets(library.ideas) || library.ideas.some(a => ids.has(a.assetId)))) return false;
  const allIds = new Set([...ids, ...library.ideas?.map(a => a.assetId) ?? []]);
  if (library.reasons !== undefined && (!isReasonAssets(library.reasons) || library.reasons.some(a => allIds.has(a.assetId)))) return false;
  let sequence = 0;
  for (const event of library.exposures) {
    if (!event || !ids.has(event.assetId) || !Number.isSafeInteger(event.sequence) || event.sequence <= sequence || event.sequence > library.sequence || !Number.isSafeInteger(event.assetRevision) || event.assetRevision < 1 || !['chinese', 'english', 'source'].includes(event.level) || ![event.content, event.essayBefore, event.shownAt].every(v => typeof v === 'string') || !(event.documentId === null || typeof event.documentId === 'string')) return false;
    sequence = event.sequence;
  }
  return true;
}

export function saveLanguageAsset(
  library: AssetLibrary,
  value: Omit<LanguageAsset, 'revision' | 'createdAt' | 'updatedAt' | 'quality' | 'qualityReview'>,
  sourceEssay: string,
  now: string,
): AssetLibrary {
  if (!value.meaningZh.trim() || !value.expression.trim() || !value.sourceQuote.trim()) {
    throw new Error('请填写中文含义、英文表达和来源片段。');
  }
  if (value.meaningZh.length > 160 || value.expression.length > 240 || value.conditions.length > 400 || value.sourceQuote.length > 2000) {
    throw new Error('内容过长，请保留一个表达单位与必要来源。');
  }
  if (!sourceEssay.includes(value.sourceQuote)) throw new Error('来源片段必须来自所选作文。');
  const old = library.assets.find(a => a.assetId === value.assetId);
  const duplicate = library.assets.find(a => a.assetId !== value.assetId && a.expression.trim().toLowerCase() === value.expression.trim().toLowerCase() && a.meaningZh.trim() === value.meaningZh.trim());
  if (duplicate) throw new Error('已有相同含义和表达的素材，请回看原条目。');
  const asset: LanguageAsset = { ...value, ...(old?.sourceCompletionId && old.sourceDocumentId === value.sourceDocumentId && old.sourceQuote === value.sourceQuote ? { sourceCompletionId: old.sourceCompletionId } : {}), meaningZh: value.meaningZh.trim(), expression: value.expression.trim(), revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now, quality: 'unreviewed' };
  delete asset.qualityReview;
  return { ...library, assets: old ? library.assets.map(a => a.assetId === asset.assetId ? asset : a) : [...library.assets, asset] };
}

export function applyAssetQuality(library: AssetLibrary, value: unknown): AssetLibrary {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const v = value as { version: number; assetId: string; revision: number; quality: LanguageAsset['quality']; checkedAt: string; promptVersion: string; callCount: number; model?: string | null };
  if (Object.keys(v).length !== (v.model === undefined ? 7 : 8) || v.model !== undefined && !(v.callCount === 0 && v.model === null || typeof v.model === 'string' && !!v.model && v.model.length <= 200) || Object.keys(v).some(k => !['version', 'assetId', 'revision', 'quality', 'checkedAt', 'promptVersion', 'callCount', 'model'].includes(k)) || v.version !== 1 || typeof v.assetId !== 'string' || !Number.isSafeInteger(v.revision) || v.revision < 1 || !['usable', 'unusable', 'unknown'].includes(v.quality) || typeof v.checkedAt !== 'string' || !Number.isFinite(Date.parse(v.checkedAt)) || v.promptVersion !== 'vnext-asset-quality-v1-source-meaning' || ![0, 1].includes(v.callCount) || v.quality === 'usable' && v.callCount !== 1) throw new Error('INVALID_RESPONSE');
  return { ...library, assets: library.assets.map(asset => asset.assetId === v.assetId && asset.revision === v.revision && asset.quality === 'unreviewed' ? { ...asset, quality: v.quality, qualityAttempt: undefined, qualityReview: { ...(v.model !== undefined ? { model: v.model } : {}), revision: v.revision, checkedAt: v.checkedAt, promptVersion: v.promptVersion } } : asset) };
}

export function assetQualityInput(asset: LanguageAsset, documents: EssayDocument[]): QualityInput {
  const document = documents.find(d => d.documentId === asset.sourceDocumentId);
  // Deleted essays retain the explicitly preserved quote; do not invent full context.
  const sourceEssay = !document ? asset.sourceQuote : asset.sourceCompletionId
    ? document.completions?.find(c => c.completionId === asset.sourceCompletionId)?.essay ?? null
    : document.essay.includes(asset.sourceQuote) ? document.essay : asset.sourceQuote;
  return { assetId: asset.assetId, revision: asset.revision, meaningZh: asset.meaningZh, expression: asset.expression, conditions: asset.conditions, sourceQuote: asset.sourceQuote, sourceEssay };
}

export function assetExposureContent(asset: LanguageAsset, level: AssetExposure['level']) {
  return level === 'chinese' ? asset.meaningZh : level === 'english' ? [asset.expression, asset.conditions].filter(Boolean).join('\n') : asset.sourceQuote;
}
export function recordAssetExposure(library: AssetLibrary, assetId: string, level: AssetExposure['level'], documentId: string | null, essayBefore: string, now: string): AssetLibrary {
  const asset = library.assets.find(a => a.assetId === assetId);
  if (!asset) return library;
  const sequence = library.sequence + 1;
  const content = assetExposureContent(asset, level);
  return { ...library, sequence, exposures: [...library.exposures, { sequence, assetId, assetRevision: asset.revision, documentId, level, content, essayBefore, shownAt: now }] };
}

export function deleteLanguageAsset(library: AssetLibrary, assetId: string): AssetLibrary {
  return { ...library, assets: library.assets.filter(a => a.assetId !== assetId), exposures: library.exposures.filter(e => e.assetId !== assetId) };
}

export function deleteAssetSource(library: AssetLibrary, documentId: string, keepAssets: boolean): AssetLibrary {
  const deletedIds = new Set(keepAssets ? [] : library.assets.filter(a => a.sourceDocumentId === documentId).map(a => a.assetId));
  return { ...library, ...(library.reasons ? { reasons: keepAssets ? library.reasons : library.reasons.filter(a => a.sourceDocumentId !== documentId) } : {}), ...(library.ideas ? { ideas: keepAssets ? library.ideas : library.ideas.filter(a => a.sourceDocumentId !== documentId) } : {}), assets: library.assets.filter(a => !deletedIds.has(a.assetId)), exposures: library.exposures.filter(e => e.documentId !== documentId && !deletedIds.has(e.assetId)) };
}

export function setQualityAttempt(library: AssetLibrary, assetId: string, revision: number, attempt: QualityAttempt, expectedAttemptId?: string): AssetLibrary {
  function update<T extends LanguageAsset | IdeaAsset | ReasonAsset>(assets: T[]): T[] {
    return assets.map(a => a.assetId === assetId && a.revision === revision && a.quality === 'unreviewed' && (!expectedAttemptId || a.qualityAttempt?.attemptId === expectedAttemptId) ? { ...a, qualityAttempt: attempt } : a);
  }
  return { ...library, assets: update(library.assets), ...(library.ideas ? { ideas: update(library.ideas) } : {}), ...(library.reasons ? { reasons: update(library.reasons) } : {}) };
}
