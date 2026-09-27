import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { readReuseInput, readReuseResult, type ReuseResult } from './server/language-reuse.ts';
import { readHelpRelations, type HelpRelationInput } from './server/help-relevance.ts';
import { attributeUsage, readAttributionInput, type AttributionInput, type UsageEvidence, type HelpEvidence, type ReuseObservation } from './usage-attribution.ts';
import type { WritingCompletion } from './writing-completion';
import type { TraceAsset } from './writing-trace';
import type { EssayDocument } from './workspace-state';
import type { LanguageAsset } from './language-assets';

export type UsageReview = {
  errorKind?: AnalysisFailure;
  asset: TraceAsset; attemptId: string; status: 'loading' | 'ready' | 'error';
  correction: 'none' | 'exclude' | 'external' | 'known';
  correctionNote?: string;
  modelCalls?: { promptVersion: string; model: string; latencyMs: number }[];
  result?: ReuseResult; evidence?: AttributionInput; callCount?: number;
  historicalHelp?: { sourceDocumentId: string; cardId: string; requestToken: string; meaningZh: string; expression: string; shownAt: string };
};
export function findHistoricalHelp(asset: LanguageAsset, source: EssayDocument | undefined): UsageReview['historicalHelp'] {
  if (!source || source.documentId !== asset.sourceDocumentId) return;
  const completion = asset.sourceCompletionId ? source.completions?.find(c => c.completionId === asset.sourceCompletionId) : undefined;
  if (asset.sourceCompletionId && !completion || !(completion?.essay ?? source.essay).includes(asset.sourceQuote)) return;
  const cards = completion?.helpCards ?? [...source.supportCards, ...source.intentCards ?? [], ...source.archivedCards];
  for (const card of cards) {
    if (!card.requestToken || !card.helpPackage) continue;
    for (const item of card.helpPackage.items) {
      if (item.kind !== 'new') continue;
      const units = item.scaffold.action === 'provide_expression' ? [{ meaningZh: item.sourceZh, expression: item.scaffold.recommendedExpression, scaffoldId: undefined }] : item.scaffold.scaffolds.map(s => ({ meaningZh: s.focusZh, expression: s.recommendedExpression, scaffoldId: s.scaffoldId }));
      for (const unit of units) {
        if (unit.meaningZh !== asset.meaningZh || unit.expression !== asset.expression) continue;
        const exposure = card.helpExposures?.find(e => e.requestToken === card.requestToken && e.itemId === item.itemId && e.scaffoldId === unit.scaffoldId && ['new_direct', 'new_scaffold'].includes(e.kind) && e.content === asset.expression && Date.parse(e.shownAt) <= Date.parse(asset.createdAt));
        if (exposure) return { sourceDocumentId: source.documentId, cardId: card.cardId, requestToken: card.requestToken, meaningZh: asset.meaningZh, expression: asset.expression, shownAt: exposure.shownAt };
      }
    }
  }
}
export function usageObservation(review: UsageReview): ReuseObservation | null {
  if (review.status !== 'ready' || !review.evidence) return null;
  const result = attributeUsage(review.evidence);
  if (review.historicalHelp) result.basis = 'prior_help_observed';
  if (review.correction === 'external') {
    if (result.finalExpression) result.finalExpression.assistance = 'unknown';
    if (result.earlierExpression) result.earlierExpression.assistance = 'unknown';
  }
  if (review.correction === 'known') result.basis = 'self_reported_known';
  return { ...result, valid: review.correction !== 'exclude' };
}
export function isUsageReviews(value: unknown, completion: Pick<WritingCompletion, 'essay' | 'taskPrompt' | 'completionId' | 'writingTrace'>): value is UsageReview[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  try {
    for (const r of value as UsageReview[]) {
      if (!validAnalysisFailure(r?.errorKind, r?.status)) return false;
      if (!r || !r.asset || ids.has(r.asset.assetId) || typeof r.attemptId !== 'string' || !r.attemptId || !['loading', 'ready', 'error'].includes(r.status) || !['none', 'exclude', 'external', 'known'].includes(r.correction)) return false;
      if (r.correctionNote !== undefined && (typeof r.correctionNote !== 'string' || r.correctionNote.length > 500)) return false;
      const { sourceDocumentId, ...asset } = r.asset;
      if (typeof sourceDocumentId !== 'string' || !sourceDocumentId) return false;
      const input = readReuseInput({ ...asset, taskPrompt: completion.taskPrompt, essay: completion.essay });
      const initial = completion.writingTrace?.initialAssets.find(a => a.assetId === input.assetId && a.revision === input.revision);
      if (initial && Object.keys(initial).some(k => initial[k as keyof TraceAsset] !== r.asset[k as keyof TraceAsset])) return false;
      if (r.historicalHelp && (r.historicalHelp.sourceDocumentId !== sourceDocumentId || r.historicalHelp.meaningZh !== input.meaningZh || r.historicalHelp.expression !== input.expression || typeof r.historicalHelp.cardId !== 'string' || !r.historicalHelp.cardId || typeof r.historicalHelp.requestToken !== 'string' || !r.historicalHelp.requestToken || !Number.isFinite(Date.parse(r.historicalHelp.shownAt)))) return false;
      ids.add(r.asset.assetId);
      if (r.modelCalls !== undefined && (!Array.isArray(r.modelCalls) || r.modelCalls.length !== r.callCount || r.modelCalls.some(m => !m || typeof m.promptVersion !== 'string' || !m.promptVersion || m.promptVersion.length > 200 || typeof m.model !== 'string' || !m.model || m.model.length > 200 || !Number.isFinite(m.latencyMs) || m.latencyMs < 0))) return false;
      if (r.status === 'ready') {
        const result = readReuseResult(r.result, input), evidence = readAttributionInput(r.evidence);
        if (evidence.assetId !== input.assetId || evidence.revision !== input.revision || evidence.completionId !== completion.completionId || evidence.sourceDocumentId !== sourceDocumentId || !Number.isSafeInteger(r.callCount) || r.callCount! < 0) return false;
        const final = evidence.observations.find(o => o.evidenceId === 'final');
        const trace = completion.writingTrace;
        if (evidence.finalEvidenceId !== 'final' || !final || final.quote !== result.quote || final.verdict !== result.verdict || final.order !== (trace ? trace.sequence + 1 : null) || evidence.traceComplete !== (trace?.complete ?? false) || evidence.basis !== 'unknown' || JSON.stringify(evidence.initialVersions) !== JSON.stringify(trace?.initialAssets.map(a => ({ assetId: a.assetId, revision: a.revision })) ?? null)) return false;
        const expectedEvents = trace && ['appropriate', 'inappropriate', 'alternate'].includes(result.verdict) ? trace.events : [];
        if (evidence.events.length !== expectedEvents.length || evidence.observations.length !== expectedEvents.length + 1) return false;
        for (const e of evidence.events) {
          const recorded = expectedEvents.find(t => t.eventId === e.eventId);
          if (!recorded || !e.displayed || e.order !== recorded.order || e.kind !== recorded.kind || e.level !== recorded.level || e.content !== recorded.content) return false;
        }
        for (const o of evidence.observations) {
          const recorded = trace?.events.find(e => `before:${e.eventId}` === o.evidenceId);
          const text = o.evidenceId === 'final' ? completion.essay : recorded?.essayBefore;
          if (o.evidenceId !== 'final' && o.order !== (recorded ? recorded.order - 1 : null)) return false;
          if (text === undefined || o.quote && !text.includes(o.quote)) return false;
        }
      } else if (r.result !== undefined || r.evidence !== undefined || r.modelCalls !== undefined || r.callCount !== undefined) return false;
    }
    return true;
  } catch { return false; }
}

export function finishUsageReview(document: EssayDocument, completion: WritingCompletion, review: UsageReview, assets: LanguageAsset[]): EssayDocument {
  return { ...document, completions: document.completions?.map(c => c.completionId === completion.completionId ? { ...c, usageReviews: c.usageReviews?.map(r => {
    if (r.asset.assetId !== review.asset.assetId || r.attemptId !== review.attemptId || r.status !== 'loading') return r;
    const unchanged = assets.some(a => a.assetId === r.asset.assetId && a.revision === r.asset.revision && a.quality === 'usable') && JSON.stringify(c.writingTrace) === JSON.stringify(completion.writingTrace);
    return unchanged ? { ...review, correction: r.correction, correctionNote: r.correctionNote, historicalHelp: r.historicalHelp } : { asset: r.asset, attemptId: r.attemptId, correction: r.correction, correctionNote: r.correctionNote, status: 'error' as const, errorKind: 'evidence_changed' as const };
  }) } : c) };
}

export async function analyzeWritingUsage(documentId: string, completion: WritingCompletion, asset: TraceAsset, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  let callCount = 0;
  const modelCalls: NonNullable<UsageReview['modelCalls']> = [];
  const request = async (path: string, input: unknown) => {
    const response = await fetcher(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
    if (!response.ok) throw new Error('ANALYSIS_UNAVAILABLE');
    const value = await response.json();
    if (!value || value.version !== 1 || ![0, 1].includes(value.callCount)) throw new Error('INVALID_RESPONSE');
    const m = value.meta;
    if (value.callCount !== 1 || m?.callCount !== 1 || typeof m.promptVersion !== 'string' || !m.promptVersion || m.promptVersion.length > 200 || typeof m.model !== 'string' || !m.model || m.model.length > 200 || !Number.isFinite(m.latencyMs) || m.latencyMs < 0) throw new Error('INVALID_RESPONSE');
    callCount += value.callCount; modelCalls.push({ promptVersion: m.promptVersion, model: m.model, latencyMs: m.latencyMs });
    return value;
  };
  const { sourceDocumentId, ...content } = asset;
  const cache = new Map<string, ReuseResult>();
  const detect = async (essay: string, taskPrompt = completion.taskPrompt) => {
    const key = JSON.stringify([taskPrompt, essay]);
    if (cache.has(key)) return cache.get(key)!;
    let result: ReuseResult;
    if (!essay.trim()) result = { verdict: 'absent', quote: '', reasonZh: '空稿未观察到使用。' };
    else if (!taskPrompt.trim()) result = { verdict: 'unknown', quote: '', reasonZh: '该阶段尚无题目上下文，无法核对。' };
    else {
      const input = readReuseInput({ ...content, taskPrompt, essay });
      const value = await request('/api/language-reuse', input);
      if (value.assetId !== asset.assetId || value.revision !== asset.revision || value.callCount !== 1) throw new Error('INVALID_RESPONSE');
      result = readReuseResult(value.result, input);
    }
    cache.set(key, result); return result;
  };
  const result = await detect(completion.essay), trace = completion.writingTrace;
  const observations: UsageEvidence[] = [{ evidenceId: 'final', order: trace ? trace.sequence + 1 : null, quote: result.quote, verdict: result.verdict }];
  const events: HelpEvidence[] = [];
  if (['appropriate', 'alternate', 'inappropriate'].includes(result.verdict) && trace) {
    for (const event of trace.events) {
      const prior = await detect(event.essayBefore, event.taskPrompt);
      observations.push({ evidenceId: `before:${event.eventId}`, order: event.order - 1, quote: prior.quote, verdict: prior.verdict });
      events.push({ eventId: event.eventId, order: event.order, kind: event.kind, displayed: true, relation: event.kind === 'exposure' && event.assetId === asset.assetId && event.revision === asset.revision && [asset.meaningZh, asset.expression, [asset.expression, asset.conditions].filter(Boolean).join('\n'), asset.sourceQuote].includes(event.content) ? 'yes' : 'unknown', level: event.level, content: event.content });
    }
    // Only distinct displayed content needs a semantic request; repeated openings share the result.
    const pending = new Map<string, HelpEvidence[]>();
    for (const event of events.filter(e => e.relation === 'unknown')) {
      const key = JSON.stringify([event.level, event.content]);
      pending.set(key, [...pending.get(key) ?? [], event]);
    }
    const groups = [...pending.values()];
    for (let index = 0; index < groups.length; index += 20) {
      const batch = groups.slice(index, index + 20);
      const input: HelpRelationInput = { taskPrompt: completion.taskPrompt, essay: completion.essay, asset: { meaningZh: asset.meaningZh, expression: asset.expression, conditions: asset.conditions }, events: batch.map(([e]) => ({ eventId: e.eventId, content: e.content, level: e.level })) };
      const value = await request('/api/help-relevance', input);
      if (value.callCount !== 1) throw new Error('INVALID_RESPONSE');
      const relations = readHelpRelations({ relations: value.relations }, input);
      batch.forEach((group, i) => group.forEach(e => { e.relation = relations[i].relation; }));
    }
  }
  const evidence: AttributionInput = { documentId, completionId: completion.completionId, assetId: asset.assetId, revision: asset.revision, sourceDocumentId, initialVersions: trace?.initialAssets.map(a => ({ assetId: a.assetId, revision: a.revision })) ?? null, traceComplete: trace?.complete ?? false, basis: 'unknown', observations, finalEvidenceId: 'final', events };
  attributeUsage(evidence);
  return { result, evidence, callCount, modelCalls };
}
