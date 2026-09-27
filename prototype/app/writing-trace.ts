import { isReasonAssets, type ReasonAsset } from './reason-chains.ts';
import { isIdeaAssets, type IdeaAsset } from './idea-assets.ts';
import type { LanguageAsset } from './language-assets';
import type { EssayDocument } from './workspace-state';

export type TraceAsset = Pick<LanguageAsset, 'assetId' | 'revision' | 'meaningZh' | 'expression' | 'conditions' | 'sourceQuote' | 'sourceDocumentId'>;
export type WritingEvent = {
  eventId: string; order: number; kind: 'exposure' | 'paste' | 'external';
  level: 'chinese' | 'english' | 'full_reference'; content: string;
  taskPrompt: string; essayBefore: string; shownAt: string; assetId?: string; revision?: number; sourceDocumentId?: string;
};
export type WritingTrace = { initialReasons?: ReasonAsset[]; initialIdeas?: IdeaAsset[]; initialAssets: TraceAsset[]; complete: boolean; sequence: number; events: WritingEvent[] };
export function removeTraceAsset(trace: WritingTrace, assetId: string): WritingTrace {
  return { ...trace, ...(trace.initialReasons ? { initialReasons: trace.initialReasons.filter(a => a.assetId !== assetId) } : {}), ...(trace.initialIdeas ? { initialIdeas: trace.initialIdeas.filter(a => a.assetId !== assetId) } : {}), complete: trace.complete && !trace.events.some(e => e.assetId === assetId), initialAssets: trace.initialAssets.filter(a => a.assetId !== assetId), events: trace.events.filter(e => e.assetId !== assetId) };
}
export function newWritingTrace(assets: LanguageAsset[], ideas: IdeaAsset[] = [], reasons: ReasonAsset[] = []): WritingTrace {
  return { initialReasons: structuredClone(reasons.filter(a => a.quality === 'usable').slice(0, 1000)), initialIdeas: structuredClone(ideas.filter(a => a.quality === 'usable').slice(0, 1000)), initialAssets: assets.slice(0, 1000).map(({ assetId, revision, meaningZh, expression, conditions, sourceQuote, sourceDocumentId }) => ({ assetId, revision, meaningZh, expression, conditions, sourceQuote, sourceDocumentId })), complete: assets.length <= 1000 && ideas.length <= 1000 && reasons.length <= 1000, sequence: 0, events: [] };
}
export function recordWritingEvent(document: EssayDocument, event: Omit<WritingEvent, 'order' | 'essayBefore' | 'taskPrompt'>): EssayDocument {
  const trace = document.writingTrace;
  if (!trace || trace.events.some(e => e.eventId === event.eventId)) return document;
  // ponytail: cap local snapshots at 80 events; beyond that retain text and mark attribution incomplete.
  if (trace.events.length >= 80 || event.content.length > 5000 || !event.content.trim()) return { ...document, writingTrace: { ...trace, complete: false } };
  return { ...document, writingTrace: { ...trace, sequence: trace.sequence + 2, events: [...trace.events, { ...event, order: trace.sequence + 2, taskPrompt: document.taskPrompt, essayBefore: document.essay }] } };
}
export function isWritingTrace(value: unknown): value is WritingTrace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as WritingTrace;
  if (typeof v.complete !== 'boolean' || !Number.isSafeInteger(v.sequence) || v.sequence < 0 || !Array.isArray(v.initialAssets) || v.initialAssets.length > 1000 || !Array.isArray(v.events) || v.events.length > 80) return false;
  if (v.initialReasons !== undefined && !isReasonAssets(v.initialReasons)) return false;
  if (v.initialIdeas !== undefined && !isIdeaAssets(v.initialIdeas)) return false;
  const ids = new Set<string>();
  for (const a of v.initialAssets) {
    const limits = { assetId: 200, meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000, sourceDocumentId: 200 };
    if (!a || Object.entries(limits).some(([k, max]) => typeof a[k as keyof TraceAsset] !== 'string' || String(a[k as keyof TraceAsset]).length > max) || !a.assetId || !a.expression.trim() || !a.meaningZh.trim() || !a.sourceQuote.trim() || ids.has(a.assetId) || !Number.isSafeInteger(a.revision) || a.revision < 1) return false;
    ids.add(a.assetId);
  }
  const events = new Set<string>();
  let order = 0;
  for (const e of v.events) {
    if (e?.sourceDocumentId !== undefined && (typeof e.sourceDocumentId !== 'string' || !e.sourceDocumentId || e.sourceDocumentId.length > 200)) return false;
    if (!e || typeof e.eventId !== 'string' || !e.eventId || e.eventId.length > 200 || events.has(e.eventId) || !Number.isSafeInteger(e.order) || e.order <= order + 1 || e.order > v.sequence || !['exposure', 'paste', 'external'].includes(e.kind) || !['chinese', 'english', 'full_reference'].includes(e.level) || typeof e.content !== 'string' || !e.content.trim() || e.content.length > 5000 || typeof e.taskPrompt !== 'string' || e.taskPrompt.length > 4000 || typeof e.essayBefore !== 'string' || e.essayBefore.length > 20000 || typeof e.shownAt !== 'string' || !Number.isFinite(Date.parse(e.shownAt)) || e.assetId !== undefined && (typeof e.assetId !== 'string' || !Number.isSafeInteger(e.revision) || e.revision! < 1)) return false;
    order = e.order; events.add(e.eventId);
  }
  return true;
}
