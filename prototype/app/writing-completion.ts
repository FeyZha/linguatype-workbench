import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { isReasonAnalysis, type ReasonAnalysis } from './reason-chains.ts';
import { isIdeaUsageReviews, type IdeaUsageReview } from './idea-usage.ts';
import { isIdeaAnalysis, type IdeaAnalysis } from './idea-assets.ts';
import { isWritingTrace, type WritingTrace } from './writing-trace.ts';
import { isUsageReviews, type UsageReview } from './writing-usage.ts';
import type { EssayDocument, SupportCard } from './workspace-state';
import type { IntentCard } from './intent-help-state';
import { isReferenceRecords, type ReferenceRecord } from './sentence-reference.ts';
import type { LanguageCandidate } from './shared/language-extraction';

export type CompletionCandidate = LanguageCandidate & { decision: 'pending' | 'saved' | 'ignored'; assetId?: string };
export type WritingCompletion = {
  errorKind?: AnalysisFailure;
  analysisMeta?: { model: string; promptVersion: string; callCount: number; latencyMs: number };
  reasons?: ReasonAnalysis;
  ideas?: IdeaAnalysis;
  ideaUsageReviews?: IdeaUsageReview[];
  reasonUsageReviews?: IdeaUsageReview[];
  prewritingRequestedAt?: string;
  references?: ReferenceRecord[];
  writingTrace?: WritingTrace;
  usageReviews?: UsageReview[];
  completionId: string;
  completedAt: string;
  taskPrompt: string;
  essay: string;
  helpCards: (SupportCard | IntentCard)[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  attemptId: string | null;
  candidates: CompletionCandidate[];
};

export function completeWriting(document: EssayDocument, completionId: string, now: string): EssayDocument {
  if (!document.taskPrompt.trim() || !document.essay.trim()) throw new Error('请先填写题目与正文。');
  const previous = document.completions?.at(-1);
  if (previous?.taskPrompt === document.taskPrompt && previous.essay === document.essay) return document;
  const newestFirst = (a: SupportCard | IntentCard, b: SupportCard | IntentCard) => b.request.requestedAt.localeCompare(a.request.requestedAt);
  // Current sentence help takes priority over removed sentences, newest within each group.
  const helpCards = [...document.supportCards, ...document.intentCards ?? []].sort(newestFirst).concat([...document.archivedCards].sort(newestFirst));
  const completion: WritingCompletion = { ...(document.prewritingRequestedAt ? { prewritingRequestedAt: document.prewritingRequestedAt } : {}), ...(document.references ? { references: structuredClone(document.references) } : {}), ...(document.writingTrace ? { writingTrace: structuredClone(document.writingTrace) } : {}), completionId, completedAt: now, taskPrompt: document.taskPrompt, essay: document.essay, helpCards: structuredClone(helpCards), status: 'idle', attemptId: null, candidates: [] };
  return { ...document, updatedAt: now, completions: [...document.completions ?? [], completion] };
}

export function readCompletionCandidates(value: unknown, completion: WritingCompletion): CompletionCandidate[] {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const data = value as { version?: unknown; candidates?: unknown };
  if (data.version !== 1 || !Array.isArray(data.candidates) || data.candidates.length > 3) throw new Error('INVALID_RESPONSE');
  const seen = new Set<string>();
  return data.candidates.map(item => {
    const limits = { meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000, reasonZh: 300 };
    if (!item || Object.keys(item).some(key => !Object.hasOwn(limits, key)) || Object.entries(limits).some(([key, max]) => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > max) || !completion.essay.includes(item.sourceQuote) || !sourceParts(item.sourceQuote, item.expression).some(p => p.highlighted) || !/[\u3400-\u9fff]/.test(item.meaningZh) || /[\u3400-\u9fff]/.test(item.expression) || seen.has(item.expression.toLowerCase())) throw new Error('INVALID_RESPONSE');
    seen.add(item.expression.toLowerCase());
    return { ...item, decision: 'pending' };
  });
}

export function isWritingCompletions(value: unknown): value is WritingCompletion[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(c => {
    if (!validAnalysisFailure(c?.errorKind, c?.status)) return false;
    if (c?.analysisMeta !== undefined && (!c.analysisMeta || typeof c.analysisMeta.model !== 'string' || !c.analysisMeta.model || c.analysisMeta.model.length > 200 || typeof c.analysisMeta.promptVersion !== 'string' || !c.analysisMeta.promptVersion || c.analysisMeta.promptVersion.length > 200 || !Number.isSafeInteger(c.analysisMeta.callCount) || c.analysisMeta.callCount < 0 || !Number.isFinite(c.analysisMeta.latencyMs) || c.analysisMeta.latencyMs < 0)) return false;
    if (c?.prewritingRequestedAt !== undefined && (typeof c.prewritingRequestedAt !== 'string' || !Number.isFinite(Date.parse(c.prewritingRequestedAt)))) return false;
    if (c?.reasons !== undefined && !isReasonAnalysis(c.reasons, c.essay)) return false;
    if (c?.ideas !== undefined && !isIdeaAnalysis(c.ideas, c.essay)) return false;
    if (c?.references !== undefined && !isReferenceRecords(c.references)) return false;
    if (!c || c.writingTrace !== undefined && !isWritingTrace(c.writingTrace) || typeof c.completionId !== 'string' || !c.completionId || ids.has(c.completionId) || typeof c.completedAt !== 'string' || !Number.isFinite(Date.parse(c.completedAt)) || typeof c.taskPrompt !== 'string' || !c.taskPrompt.trim() || c.taskPrompt.length > 4000 || typeof c.essay !== 'string' || !c.essay.trim() || c.essay.length > 20000 || !Array.isArray(c.helpCards) || !['idle', 'loading', 'ready', 'error'].includes(c.status) || !(c.attemptId === null || typeof c.attemptId === 'string') || !Array.isArray(c.candidates)) return false;
    ids.add(c.completionId);
    if (c.reasonUsageReviews !== undefined && !isIdeaUsageReviews(c.reasonUsageReviews, c, true)) return false;
    if (c.ideaUsageReviews !== undefined && !isIdeaUsageReviews(c.ideaUsageReviews, c)) return false;
    if (c.usageReviews !== undefined && !isUsageReviews(c.usageReviews, c)) return false;
    try {
      readCompletionCandidates({ version: 1, candidates: c.candidates.map((candidate: CompletionCandidate) => {
        if (!candidate || !['pending', 'saved', 'ignored'].includes(candidate.decision) || (candidate.assetId !== undefined && typeof candidate.assetId !== 'string')) throw new Error('INVALID_RECORD');
        const { decision, assetId, ...content } = candidate;
        void decision; void assetId;
        return content;
      }) }, c);
      return true;
    } catch { return false; }
  });
}

export function finishCompletion(document: EssayDocument, completionId: string, attemptId: string, candidates: CompletionCandidate[] | null, analysisMeta?: WritingCompletion['analysisMeta'], errorKind: AnalysisFailure = 'request_failed'): EssayDocument {
  return { ...document, completions: document.completions?.map(c => c.completionId === completionId && c.attemptId === attemptId && c.status === 'loading' ? { ...c, analysisMeta, errorKind: candidates ? undefined : errorKind, status: candidates ? 'ready' : 'error', candidates: candidates ?? c.candidates } : c) };
}

export function sourceParts(source: string, expression: string) {
  if (!expression) return [{ text: source, highlighted: false }];
  const parts: { text: string; highlighted: boolean }[] = [];
  let start = 0;
  for (let index = source.indexOf(expression); index !== -1; index = source.indexOf(expression, index + expression.length)) {
    if (/[A-Za-z'’-]/.test(source[index - 1] ?? '') || /[A-Za-z'’-]/.test(source[index + expression.length] ?? '')) continue;
    if (index > start) parts.push({ text: source.slice(start, index), highlighted: false });
    parts.push({ text: expression, highlighted: true });
    start = index + expression.length;
  }
  if (start < source.length) parts.push({ text: source.slice(start), highlighted: false });
  return parts;
}
