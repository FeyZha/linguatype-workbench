import { validQualityAttempt, type QualityAttempt } from './analysis-record.ts';
import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { hasChinese } from './sentence-tracking.ts';
import { hasIdeaSource } from './idea-assets.ts';

export const reasonRelations = { cause: '使得', support: '支持', condition: '在此前提下' };
export type ReasonNode = { textZh: string; sourceQuote: string };
export type ReasonLink = { relation: keyof typeof reasonRelations; sourceQuote: string };
// ponytail: linear chains of 2–3 nodes only; no graph editor or inferred bridging nodes.
export type ReasonCandidate = { nodes: ReasonNode[]; links: ReasonLink[] };
export type ReasonInput = { taskPrompt: string; completedEssay: string; existingChains: string[] };
export function reasonText(c: ReasonCandidate) { return c.nodes.map((n, i) => (i ? ` —${reasonRelations[c.links[i - 1].relation]}→ ` : '') + n.textZh).join(''); }
export function readReasonInput(value: unknown): ReasonInput {
  const v = value as ReasonInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 3 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || typeof v.completedEssay !== 'string' || !v.completedEssay.trim() || v.completedEssay.length > 20000 || !Array.isArray(v.existingChains) || v.existingChains.length > 100 || v.existingChains.some(s => typeof s !== 'string' || !s.trim() || s.length > 800)) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}
export function readReasonCandidate(value: unknown, essay: string): ReasonCandidate {
  const c = value as ReasonCandidate;
  if (!c || typeof c !== 'object' || Object.keys(c).length !== 2 || !Array.isArray(c.nodes) || c.nodes.length < 2 || c.nodes.length > 3 || !Array.isArray(c.links) || c.links.length !== c.nodes.length - 1) throw new Error('INVALID_OUTPUT');
  for (const node of c.nodes) if (!node || Object.keys(node).length !== 2 || typeof node.textZh !== 'string' || !hasChinese(node.textZh) || node.textZh.length > 200 || typeof node.sourceQuote !== 'string' || !hasIdeaSource(essay, node.sourceQuote)) throw new Error('INVALID_OUTPUT');
  for (const link of c.links) if (!link || Object.keys(link).length !== 2 || !Object.hasOwn(reasonRelations, link.relation) || typeof link.sourceQuote !== 'string' || !hasIdeaSource(essay, link.sourceQuote)) throw new Error('INVALID_OUTPUT');
  if (new Set(c.nodes.map(n => n.textZh.trim())).size !== c.nodes.length) throw new Error('INVALID_OUTPUT');
  return structuredClone(c);
}
export function readReasonCandidates(value: unknown, input: ReasonInput): ReasonCandidate[] {
  const v = value as { candidates: ReasonCandidate[] };
  if (!v || Object.keys(v).length !== 1 || !Array.isArray(v.candidates) || v.candidates.length > 2) throw new Error('INVALID_OUTPUT');
  const seen = new Set(input.existingChains);
  return v.candidates.map(c => { const checked = readReasonCandidate(c, input.completedEssay), key = reasonText(checked); if (seen.has(key)) throw new Error('INVALID_OUTPUT'); seen.add(key); return checked; });
}
export type ReasonQualityInput = { taskPrompt: string; candidate: ReasonCandidate; sourceEssay: string | null };
export function readReasonQualityInput(value: unknown): ReasonQualityInput {
  const v = value as ReasonQualityInput;
  if (!v || Object.keys(v).length !== 3 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || !(v.sourceEssay === null || typeof v.sourceEssay === 'string' && v.sourceEssay.length <= 20000)) throw new Error('INVALID_INPUT');
  // Validate the candidate shape independently; missing original source is evaluated as unknown, not fabricated context.
  const quotes = [...v.candidate?.nodes ?? [], ...v.candidate?.links ?? []].map(n => n?.sourceQuote).filter(s => typeof s === 'string').join(' ');
  readReasonCandidate(v.candidate, quotes);
  return structuredClone(v);
}
export function readReasonQuality(value: unknown): 'usable' | 'unusable' | 'unknown' {
  const v = value as { quality: 'usable' | 'unusable' | 'unknown' };
  if (!v || Object.keys(v).length !== 1 || !['usable', 'unusable', 'unknown'].includes(v.quality)) throw new Error('INVALID_OUTPUT');
  return v.quality;
}

export function readReasonTransitions(value: unknown, input: ReasonInput): ReasonCandidate[] {
  const v = value as { chains: { initialState: ReasonNode; steps: (ReasonLink & { resultingState: ReasonNode })[] }[] };
  if (!v || Object.keys(v).length !== 1 || !Array.isArray(v.chains) || v.chains.length > 2) throw new Error('INVALID_OUTPUT');
  const candidates = v.chains.map(c => {
    if (!c || Object.keys(c).length !== 2 || !Array.isArray(c.steps) || c.steps.length < 1 || c.steps.length > 2 || c.steps.some(s => !s || Object.keys(s).length !== 3)) throw new Error('INVALID_OUTPUT');
    return { nodes: [c.initialState, ...c.steps.map(s => s.resultingState)], links: c.steps.map(({ relation, sourceQuote }) => ({ relation, sourceQuote })) };
  });
  return readReasonCandidates({ candidates }, input);
}

export type ReasonAsset = ReasonCandidate & {
  assetId: string; revision: number; sourceDocumentId: string; sourceCompletionId: string; sourceTaskPrompt: string;
  createdAt: string; updatedAt: string; quality: 'unreviewed' | 'usable' | 'unusable' | 'unknown';
  qualityAttempt?: QualityAttempt;
  qualityReview?: { model?: string | null; revision: number; checkedAt: string; promptVersion: string };
};
export function reasonQuotes(c: ReasonCandidate) { return [...new Set([...c.nodes, ...c.links].map(n => n.sourceQuote))]; }
export function isReasonAssets(value: unknown): value is ReasonAsset[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  try {
    return value.every((a: ReasonAsset) => {
      if (!a || !['assetId', 'sourceDocumentId', 'sourceCompletionId', 'sourceTaskPrompt', 'createdAt', 'updatedAt'].every(k => typeof a[k as keyof ReasonAsset] === 'string' && String(a[k as keyof ReasonAsset]).trim()) || [a.assetId, a.sourceDocumentId, a.sourceCompletionId].some(s => s.length > 200) || a.sourceTaskPrompt.length > 4000 || ids.has(a.assetId) || !Number.isSafeInteger(a.revision) || a.revision < 1 || !Number.isFinite(Date.parse(a.createdAt)) || !Number.isFinite(Date.parse(a.updatedAt)) || !['unreviewed', 'usable', 'unusable', 'unknown'].includes(a.quality)) return false;
      readReasonCandidate({ nodes: a.nodes, links: a.links }, reasonQuotes(a).join(' '));
    if (!validQualityAttempt(a)) return false;
    if (a.qualityReview?.model !== undefined && !(a.qualityReview.model === null || typeof a.qualityReview.model === 'string' && !!a.qualityReview.model && a.qualityReview.model.length <= 200)) return false;
      if (a.quality !== 'unreviewed' && (!a.qualityReview || a.qualityReview.revision !== a.revision || a.qualityReview.promptVersion !== 'vnext-reason-quality-v4-scope-first' || typeof a.qualityReview.checkedAt !== 'string' || !Number.isFinite(Date.parse(a.qualityReview.checkedAt)))) return false;
      ids.add(a.assetId); return true;
    });
  } catch { return false; }
}
export function saveReasonAsset(assets: ReasonAsset[], value: ReasonCandidate & Pick<ReasonAsset, 'assetId' | 'sourceDocumentId' | 'sourceCompletionId' | 'sourceTaskPrompt'>, essay: string, now: string): ReasonAsset[] {
  const candidate = readReasonCandidate({ nodes: value.nodes, links: value.links }, essay);
  if (assets.some(a => a.assetId !== value.assetId && reasonText(a) === reasonText(candidate))) throw new Error('已有相同理由链，请回看原条目。');
  const old = assets.find(a => a.assetId === value.assetId);
  const asset: ReasonAsset = { ...candidate, assetId: value.assetId, sourceDocumentId: value.sourceDocumentId, sourceCompletionId: value.sourceCompletionId, sourceTaskPrompt: value.sourceTaskPrompt, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now, quality: 'unreviewed' };
  if (!isReasonAssets([asset]) || !old && assets.length >= 1000) throw new Error('请保留2—3个节点及明确关系和来源；最多1000条。');
  return old ? assets.map(a => a.assetId === asset.assetId ? asset : a) : [...assets, asset];
}
export function applyReasonQuality(assets: ReasonAsset[], value: unknown): ReasonAsset[] {
  const v = value as { version: number; assetId: string; revision: number; quality: ReasonAsset['quality']; checkedAt: string; promptVersion: string; callCount: number; model?: string | null };
  if (!v || Object.keys(v).length !== (v.model === undefined ? 7 : 8) || v.model !== undefined && !(v.callCount === 0 && v.model === null || typeof v.model === 'string' && !!v.model && v.model.length <= 200) || v.version !== 1 || typeof v.assetId !== 'string' || !v.assetId || !Number.isSafeInteger(v.revision) || v.revision < 1 || ![0, 1].includes(v.callCount) || v.quality === 'usable' && v.callCount !== 1 || !['usable', 'unusable', 'unknown'].includes(v.quality) || typeof v.checkedAt !== 'string' || !Number.isFinite(Date.parse(v.checkedAt)) || v.promptVersion !== 'vnext-reason-quality-v4-scope-first') throw new Error('INVALID_OUTPUT');
  return assets.map(a => a.assetId === v.assetId && a.revision === v.revision && a.quality === 'unreviewed' ? { ...a, quality: v.quality, qualityAttempt: undefined, qualityReview: { ...(v.model !== undefined ? { model: v.model } : {}), revision: v.revision, checkedAt: v.checkedAt, promptVersion: v.promptVersion } } : a);
}
export type ReasonAnalysis = {
  errorKind?: AnalysisFailure;
  attemptId: string; status: 'loading' | 'ready' | 'error';
  candidates: (ReasonCandidate & { decision: 'pending' | 'saved' | 'ignored'; assetId?: string })[];
  meta?: { callCount: number; promptVersion: string; model: string; latencyMs: number };
};
export function isReasonAnalysis(value: unknown, essay: string): value is ReasonAnalysis {
  const v = value as ReasonAnalysis;
  if (!validAnalysisFailure(v?.errorKind, v?.status)) return false;
  if (!v || typeof v.attemptId !== 'string' || !v.attemptId || !['loading', 'ready', 'error'].includes(v.status) || !Array.isArray(v.candidates)) return false;
  if (v.status === 'ready' && (!v.meta || v.meta.callCount !== 1 || v.meta.promptVersion !== 'vnext-reason-extract-v7-relation-priority' || typeof v.meta.model !== 'string' || !v.meta.model || !Number.isFinite(v.meta.latencyMs) || v.meta.latencyMs < 0)) return false;
  try { readReasonCandidates({ candidates: v.candidates.map(c => {
    if (!c || !['pending', 'saved', 'ignored'].includes(c.decision) || c.decision === 'saved' && (typeof c.assetId !== 'string' || !c.assetId)) throw new Error('INVALID_RECORD');
    return { nodes: c.nodes, links: c.links };
  }) }, { taskPrompt: '', completedEssay: essay, existingChains: [] }); return true; } catch { return false; }
}
