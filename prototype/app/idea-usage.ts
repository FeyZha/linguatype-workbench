import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { readHelpRelations } from './server/help-relevance.ts';
import type { WritingEvent } from './writing-trace.ts';
import { isReasonAssets, reasonText, reasonQuotes, type ReasonAsset } from './reason-chains.ts';
import { isIdeaAssets, type IdeaAsset } from './idea-assets.ts';
import { readIdeaReuseResult, type IdeaReuseResult } from './idea-reuse.ts';
import { attributeUsage, type AttributionInput, type UsageEvidence } from './usage-attribution.ts';
import type { WritingCompletion } from './writing-completion';
import type { EssayDocument } from './workspace-state';

export type ContentAsset = IdeaAsset | ReasonAsset;
// Shared persistence and attribution for the two content-material types.
export type IdeaUsageReview = {
  errorKind?: AnalysisFailure;
  asset: ContentAsset; attemptId: string; status: 'loading' | 'ready' | 'error';
  correction: 'none' | 'exclude' | 'external';
  modelCalls?: { promptVersion: string; model: string; latencyMs: number }[];
  relations?: { eventId: string; relation: 'yes' | 'no' | 'unknown' }[];
  result?: IdeaReuseResult; priors?: { eventId: string; result: IdeaReuseResult }[]; callCount?: number;
};
function knownContent(event: WritingEvent, asset: ContentAsset) {
  const content = 'nodes' in asset ? [reasonText(asset), ...reasonQuotes(asset)] : [asset.textZh, asset.sourceQuote];
  return event.kind === 'exposure' && event.assetId === asset.assetId && event.revision === asset.revision && content.includes(event.content);
}
function aggregate(result: IdeaReuseResult): Pick<UsageEvidence, 'quote' | 'verdict'> {
  const different = result.occurrences.find(o => o.verdict === 'inappropriate');
  if (different) return different;
  if (!result.complete || result.occurrences.some(o => o.verdict === 'unknown')) return { verdict: 'unknown', quote: result.occurrences[0]?.quote ?? '' };
  return result.occurrences[0] ?? { verdict: 'absent', quote: '' };
}
export function ideaObservation(documentId: string, completion: WritingCompletion, review: IdeaUsageReview) {
  if (review.status !== 'ready' || !review.result) return null;
  const trace = completion.writingTrace, asset = review.asset;
  const final = aggregate(review.result);
  const relevantEvents = review.result.occurrences.length ? trace?.events ?? [] : [];
  const evidence: AttributionInput = {
    documentId, completionId: completion.completionId, assetId: asset.assetId, revision: asset.revision, sourceDocumentId: asset.sourceDocumentId,
    initialVersions: ('nodes' in asset ? trace?.initialReasons : trace?.initialIdeas)?.map(a => ({ assetId: a.assetId, revision: a.revision })) ?? null,
    traceComplete: !!trace?.complete && (review.priors?.every(p => p.result.complete && p.result.occurrences.every(o => o.verdict !== 'unknown')) ?? true), basis: 'unknown', finalEvidenceId: 'final',
    observations: [{ evidenceId: 'final', order: trace ? trace.sequence + 1 : null, ...final }, ...relevantEvents.map(e => ({ evidenceId: 'before:' + e.eventId, order: e.order - 1, ...aggregate(review.priors!.find(p => p.eventId === e.eventId)!.result) }))],
    // Different or external content is not assumed irrelevant. Unknown assistance blocks autonomous-use claims.
    events: relevantEvents.map(e => ({ eventId: e.eventId, order: e.order, kind: e.kind, displayed: true, level: e.level, content: e.content, relation: knownContent(e, asset) ? 'yes' as const : review.relations?.find(r => r.eventId === e.eventId)?.relation ?? 'unknown' as const })),
  };
  const observed = attributeUsage(evidence);
  if (review.correction === 'external') {
    if (observed.finalExpression) observed.finalExpression.assistance = 'unknown';
    if (observed.earlierExpression) observed.earlierExpression.assistance = 'unknown';
  }
  return { ...observed, valid: review.correction !== 'exclude', evidence };
}
export function isIdeaUsageReviews(value: unknown, completion: Pick<WritingCompletion, 'essay' | 'taskPrompt' | 'writingTrace'>, reason = false): value is IdeaUsageReview[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  try {
    for (const r of value as IdeaUsageReview[]) {
      if (!validAnalysisFailure(r?.errorKind, r?.status)) return false;
      if (!r || !(reason ? isReasonAssets([r.asset]) : isIdeaAssets([r.asset])) || r.asset.quality !== 'usable' || ids.has(r.asset.assetId) || typeof r.attemptId !== 'string' || !r.attemptId || r.attemptId.length > 200 || !['loading', 'ready', 'error'].includes(r.status) || !['none', 'exclude', 'external'].includes(r.correction)) return false;
      ids.add(r.asset.assetId);
      if (r.modelCalls !== undefined && (!Array.isArray(r.modelCalls) || r.modelCalls.length !== r.callCount || r.modelCalls.some(m => !m || typeof m.promptVersion !== 'string' || !m.promptVersion || m.promptVersion.length > 200 || typeof m.model !== 'string' || !m.model || m.model.length > 200 || !Number.isFinite(m.latencyMs) || m.latencyMs < 0))) return false;
      const initial = (reason ? completion.writingTrace?.initialReasons : completion.writingTrace?.initialIdeas)?.find(a => a.assetId === r.asset.assetId && a.revision === r.asset.revision);
      if (initial && JSON.stringify(initial) !== JSON.stringify(r.asset)) return false;
      if (r.status !== 'ready') { if (r.result !== undefined || r.priors !== undefined || r.callCount !== undefined || r.modelCalls !== undefined || r.relations !== undefined) return false; continue; }
      const result = readIdeaReuseResult(r.result, { taskPrompt: completion.taskPrompt, essay: completion.essay, asset: r.asset });
      if (!Number.isSafeInteger(r.callCount) || r.callCount! < 0 || r.callCount! > 10 || !Array.isArray(r.priors)) return false;
      const events = result.occurrences.length ? completion.writingTrace?.events ?? [] : [];
      if (r.priors.length !== events.length) return false;
      if (r.relations !== undefined) readHelpRelations({ relations: r.relations }, { events: events.filter(e => !knownContent(e, r.asset)) });
      r.priors.forEach((p, i) => {
        if (!p || Object.keys(p).length !== 2 || p.eventId !== events[i].eventId) throw new Error('INVALID_RECORD');
        readIdeaReuseResult(p.result, { taskPrompt: events[i].taskPrompt, essay: events[i].essayBefore, asset: r.asset });
      });
    }
    return true;
  } catch { return false; }
}
export function finishIdeaUsage(document: EssayDocument, completion: WritingCompletion, review: IdeaUsageReview, assets: ContentAsset[]): EssayDocument {
  const field = 'nodes' in review.asset ? 'reasonUsageReviews' : 'ideaUsageReviews';
  return { ...document, completions: document.completions?.map(c => c.completionId === completion.completionId ? { ...c, [field]: c[field]?.map(r => {
    if (r.asset.assetId !== review.asset.assetId || r.attemptId !== review.attemptId || r.status !== 'loading') return r;
    return assets.some(a => a.assetId === r.asset.assetId && a.revision === r.asset.revision && a.quality === 'usable') && JSON.stringify(c.writingTrace) === JSON.stringify(completion.writingTrace)
      ? { ...review, correction: r.correction } : { asset: r.asset, attemptId: r.attemptId, correction: r.correction, status: 'error' as const, errorKind: 'evidence_changed' as const };
  }) } : c) };
}
export async function analyzeIdeaUsage(completion: WritingCompletion, asset: ContentAsset, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  let callCount = 0;
  const modelCalls: NonNullable<IdeaUsageReview['modelCalls']> = [];
  const cache = new Map<string, IdeaReuseResult>();
  function recordCall(value: { meta?: { callCount?: number; promptVersion?: string; model?: string; latencyMs?: number } }) {
    const m = value?.meta;
    if (m?.callCount !== 1 || typeof m.promptVersion !== 'string' || !m.promptVersion || m.promptVersion.length > 200 || typeof m.model !== 'string' || !m.model || m.model.length > 200 || typeof m.latencyMs !== 'number' || !Number.isFinite(m.latencyMs) || m.latencyMs < 0) throw new Error('INVALID_RESPONSE');
    callCount++; modelCalls.push({ promptVersion: m.promptVersion, model: m.model, latencyMs: m.latencyMs });
  }
  async function detect(essay: string, taskPrompt: string, prior = false): Promise<IdeaReuseResult> {
    if (!essay.trim()) return { complete: true, occurrences: [] };
    const key = JSON.stringify([taskPrompt, essay]);
    if (cache.has(key)) return cache.get(key)!;
    // ponytail: at most 5 distinct prior drafts plus final; beyond this return unknown, never assume no help.
    if (!taskPrompt.trim() || prior && callCount >= 6) return { complete: false, occurrences: [] };
    const input = { taskPrompt, essay, asset };
    const response = await fetcher('nodes' in asset ? '/api/reason-reuse' : '/api/idea-reuse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
    if (!response.ok) throw new Error('IDEA_USAGE_UNAVAILABLE');
    const value = await response.json();
    if (!value || value.version !== 1 || Object.keys(value).length !== 3 || value.meta?.callCount !== 1) throw new Error('INVALID_RESPONSE');
    recordCall(value);
    const result = readIdeaReuseResult(value.result, input); cache.set(key, result); return result;
  }
  const result = await detect(completion.essay, completion.taskPrompt);
  const priors = [];
  for (const event of result.occurrences.length ? completion.writingTrace?.events ?? [] : []) priors.push({ eventId: event.eventId, result: await detect(event.essayBefore, event.taskPrompt, true) });
  const pending = (result.occurrences.length ? completion.writingTrace?.events ?? [] : []).filter(e => !knownContent(e, asset));
  const key = (e: WritingEvent) => JSON.stringify([e.level, e.content]);
  const unique = [...new Map(pending.map(e => [key(e), e])).values()];
  const byContent = new Map<string, 'yes' | 'no' | 'unknown'>();
  // ponytail: the trace stores at most 80 events, so four batches of 20 cover all shown content.
  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20);
    const input = { taskPrompt: completion.taskPrompt, essay: completion.essay, asset, events: batch.map(({ eventId, content, level }) => ({ eventId, content, level })) };
    const response = await fetcher('/api/content-relevance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
    if (!response.ok) throw new Error('CONTENT_RELEVANCE_UNAVAILABLE');
    const value = await response.json();
    if (!value || value.version !== 1 || Object.keys(value).length !== 3) throw new Error('INVALID_RESPONSE');
    recordCall(value);
    for (const relation of readHelpRelations({ relations: value.result }, input)) byContent.set(key(batch.find(e => e.eventId === relation.eventId)!), relation.relation);
  }
  const relations = pending.map(e => ({ eventId: e.eventId, relation: byContent.get(key(e))! }));
  return { result, priors, relations, callCount, modelCalls };
}
