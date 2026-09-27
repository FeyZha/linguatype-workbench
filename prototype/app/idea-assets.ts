import { validQualityAttempt, type QualityAttempt } from './analysis-record.ts';
import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { findSentences, hasChinese } from './sentence-tracking.ts';

export type IdeaCandidate = { textZh: string; sourceQuote: string };
export type IdeaExtractionInput = { taskPrompt: string; completedEssay: string; existingIdeas: string[] };
export type IdeaAsset = IdeaCandidate & {
  assetId: string; revision: number; sourceDocumentId: string; sourceCompletionId: string;
  createdAt: string; updatedAt: string;
  quality: 'unreviewed' | 'usable' | 'unusable' | 'unknown';
  qualityAttempt?: QualityAttempt;
  qualityReview?: { model?: string | null; revision: number; checkedAt: string; promptVersion: string };
};
export type IdeaAnalysis = {
  errorKind?: AnalysisFailure;
  status: 'loading' | 'ready' | 'error'; attemptId: string;
  meta?: { callCount: number; promptVersion: string; model: string; latencyMs: number };
  candidates: (IdeaCandidate & { decision: 'pending' | 'saved' | 'ignored'; assetId?: string })[];
};

export function hasIdeaSource(essay: string, quote: string) {
  const sentences = findSentences(essay), ends = new Set(sentences.map(s => s.end));
  const text = quote.trim();
  return !!text && quote.length <= 2000 && essay.includes(quote) && sentences.some(s => ends.has(s.start + text.length) && essay.startsWith(text, s.start));
}

export function readIdeaInput(value: unknown): IdeaExtractionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const v = value as IdeaExtractionInput;
  if (Object.keys(v).length !== 3 || Object.keys(v).some(k => !['taskPrompt', 'completedEssay', 'existingIdeas'].includes(k)) || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || typeof v.completedEssay !== 'string' || !v.completedEssay.trim() || v.completedEssay.length > 20000 || !Array.isArray(v.existingIdeas) || v.existingIdeas.length > 100 || v.existingIdeas.some(s => typeof s !== 'string' || !s.trim() || s.length > 400)) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}

export function readIdeaCandidates(value: unknown, input: IdeaExtractionInput): IdeaCandidate[] {
  const candidates = (value as { candidates?: unknown } | null)?.candidates;
  if (!value || Object.keys(value).length !== 1 || !Array.isArray(candidates) || candidates.length > 3) throw new Error('INVALID_OUTPUT');
  const seen = new Set<string>();
  return candidates.map(c => {
    if (!c || Object.keys(c).length !== 2 || Object.keys(c).some(k => !['textZh', 'sourceQuote'].includes(k)) || typeof c.textZh !== 'string' || !hasChinese(c.textZh) || c.textZh.length > 400 || typeof c.sourceQuote !== 'string' || !hasIdeaSource(input.completedEssay, c.sourceQuote) || seen.has(c.textZh.trim()) || input.existingIdeas.includes(c.textZh.trim())) throw new Error('INVALID_OUTPUT');
    seen.add(c.textZh.trim());
    return { textZh: c.textZh.trim(), sourceQuote: c.sourceQuote };
  });
}

export function isIdeaAssets(value: unknown): value is IdeaAsset[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  return value.every(a => {
    if (!a || !['assetId', 'textZh', 'sourceQuote', 'sourceDocumentId', 'sourceCompletionId', 'createdAt', 'updatedAt'].every(k => typeof a[k] === 'string' && a[k].trim()) || a.assetId.length > 200 || a.sourceDocumentId.length > 200 || a.sourceCompletionId.length > 200 || !hasChinese(a.textZh) || a.textZh.length > 400 || a.sourceQuote.length > 2000 || !Number.isSafeInteger(a.revision) || a.revision < 1 || ids.has(a.assetId) || !Number.isFinite(Date.parse(a.createdAt)) || !Number.isFinite(Date.parse(a.updatedAt)) || !['unreviewed', 'usable', 'unusable', 'unknown'].includes(a.quality)) return false;
    if (!validQualityAttempt(a)) return false;
    if (a.qualityReview?.model !== undefined && !(a.qualityReview.model === null || typeof a.qualityReview.model === 'string' && !!a.qualityReview.model && a.qualityReview.model.length <= 200)) return false;
    if (a.quality !== 'unreviewed' && (!a.qualityReview || a.qualityReview.revision !== a.revision || a.qualityReview.promptVersion !== 'vnext-idea-quality-v1-source-scope' || typeof a.qualityReview.checkedAt !== 'string' || !Number.isFinite(Date.parse(a.qualityReview.checkedAt)))) return false;
    ids.add(a.assetId); return true;
  });
}

export function saveIdeaAsset(assets: IdeaAsset[], value: IdeaCandidate & { assetId: string; sourceDocumentId: string; sourceCompletionId: string }, sourceEssay: string, now: string): IdeaAsset[] {
  if (!hasIdeaSource(sourceEssay, value.sourceQuote)) throw new Error('来源必须是所选完成稿中的完整原句。');
  if (assets.some(a => a.assetId !== value.assetId && a.textZh.trim() === value.textZh.trim())) throw new Error('已有相同观点，请回看原条目。');
  const old = assets.find(a => a.assetId === value.assetId);
  const asset: IdeaAsset = { ...value, textZh: value.textZh.trim(), revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now, quality: 'unreviewed' };
  if (!isIdeaAssets([asset]) || !old && assets.length >= 1000) throw new Error('请保留一条中文观点和有效来源（最多1000条）。');
  return old ? assets.map(a => a.assetId === asset.assetId ? asset : a) : [...assets, asset];
}

export function applyIdeaQuality(assets: IdeaAsset[], result: { version: number; assetId: string; revision: number; quality: IdeaAsset['quality']; checkedAt: string; promptVersion: string; callCount: number; model?: string | null }): IdeaAsset[] {
  if (!result || Object.keys(result).length !== (result.model === undefined ? 7 : 8) || result.model !== undefined && !(result.callCount === 0 && result.model === null || typeof result.model === 'string' && !!result.model && result.model.length <= 200) || result.version !== 1 || typeof result.assetId !== 'string' || !result.assetId || !Number.isSafeInteger(result.revision) || result.revision < 1 || ![0, 1].includes(result.callCount) || result.quality === 'usable' && result.callCount !== 1 || !['usable', 'unusable', 'unknown'].includes(result.quality) || result.promptVersion !== 'vnext-idea-quality-v1-source-scope' || typeof result.checkedAt !== 'string' || !Number.isFinite(Date.parse(result.checkedAt))) throw new Error('INVALID_OUTPUT');
  return assets.map(a => a.assetId === result.assetId && a.revision === result.revision && a.quality === 'unreviewed' ? { ...a, quality: result.quality, qualityAttempt: undefined, qualityReview: { ...(result.model !== undefined ? { model: result.model } : {}), revision: result.revision, checkedAt: result.checkedAt, promptVersion: result.promptVersion } } : a);
}

export function isIdeaAnalysis(value: unknown, essay: string): value is IdeaAnalysis {
  if (!value || typeof value !== 'object') return false;
  const v = value as IdeaAnalysis;
  if (!validAnalysisFailure(v?.errorKind, v?.status)) return false;
  if (!['loading', 'ready', 'error'].includes(v.status) || typeof v.attemptId !== 'string' || !v.attemptId || !Array.isArray(v.candidates)) return false;
  if (v.status === 'ready' && (!v.meta || v.meta.callCount !== 1 || v.meta.promptVersion !== 'vnext-idea-extract-v1-source-scope' || typeof v.meta.model !== 'string' || !v.meta.model || v.meta.model.length > 200 || !Number.isFinite(v.meta.latencyMs) || v.meta.latencyMs < 0)) return false;
  try {
    readIdeaCandidates({ candidates: v.candidates.map(c => {
      if (!c || !['pending', 'saved', 'ignored'].includes(c.decision) || c.decision === 'saved' && (typeof c.assetId !== 'string' || !c.assetId)) throw new Error('INVALID_RECORD');
      return { textZh: c.textZh, sourceQuote: c.sourceQuote };
    }) }, { taskPrompt: '', completedEssay: essay, existingIdeas: [] });
    return true;
  } catch { return false; }
}
