// Verified usage/relevance evidence in, deterministic attribution out; no model calls.
import type { ReuseResult } from './shared/language-reuse.ts';
export type Assistance = 'unprompted_observed' | 'chinese' | 'english' | 'full_reference' | 'unknown';
export type UsageEvidence = { evidenceId: string; order: number | null; quote: string; verdict: ReuseResult['verdict'] };
export type HelpEvidence = { eventId: string; order: number | null; kind: 'exposure' | 'paste' | 'external'; displayed: boolean; relation: 'yes' | 'no' | 'unknown'; level: 'chinese' | 'english' | 'full_reference'; content: string };
export type AttributionInput = {
  documentId: string;
  completionId: string;
  assetId: string;
  revision: number;
  sourceDocumentId: string;
  initialVersions: { assetId: string; revision: number }[] | null;
  traceComplete: boolean;
  basis: 'prior_help_observed' | 'self_reported_known' | 'unknown';
  observations: UsageEvidence[];
  finalEvidenceId: string;
  events: HelpEvidence[];
};
export function readAttributionInput(value: unknown): AttributionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ATTRIBUTION');
  const v = value as AttributionInput;
  const validOrder = (n: unknown) => n === null || Number.isSafeInteger(n) && Number(n) >= 0;
  if (Object.keys(v).length !== 11 || ![v.documentId, v.completionId, v.assetId, v.sourceDocumentId, v.finalEvidenceId].every(s => typeof s === 'string' && s.trim() && s.length <= 200) || !Number.isSafeInteger(v.revision) || v.revision < 1 || typeof v.traceComplete !== 'boolean' || !['prior_help_observed', 'self_reported_known', 'unknown'].includes(v.basis) || !(v.initialVersions === null || Array.isArray(v.initialVersions) && v.initialVersions.length <= 1000 && v.initialVersions.every(a => a && typeof a.assetId === 'string' && a.assetId && Number.isSafeInteger(a.revision) && a.revision > 0)) || !Array.isArray(v.observations) || !v.observations.length || v.observations.length > 200 || !Array.isArray(v.events) || v.events.length > 500) throw new Error('INVALID_ATTRIBUTION');
  const evidenceIds = new Set<string>(), eventIds = new Set<string>();
  for (const o of v.observations) {
    if (!o || typeof o.evidenceId !== 'string' || !o.evidenceId || evidenceIds.has(o.evidenceId) || !validOrder(o.order) || typeof o.quote !== 'string' || o.quote.length > 2000 || !['appropriate', 'inappropriate', 'alternate', 'absent', 'unknown'].includes(o.verdict) || ['appropriate', 'inappropriate', 'alternate'].includes(o.verdict) && !o.quote.trim()) throw new Error('INVALID_ATTRIBUTION');
    evidenceIds.add(o.evidenceId);
  }
  for (const e of v.events) {
    if (!e || typeof e.eventId !== 'string' || !e.eventId || eventIds.has(e.eventId) || !validOrder(e.order) || typeof e.displayed !== 'boolean' || !['exposure', 'paste', 'external'].includes(e.kind) || !['yes', 'no', 'unknown'].includes(e.relation) || !['chinese', 'english', 'full_reference'].includes(e.level) || typeof e.content !== 'string' || !e.content.trim() || e.content.length > 5000) throw new Error('INVALID_ATTRIBUTION');
    eventIds.add(e.eventId);
  }
  if (!evidenceIds.has(v.finalEvidenceId)) throw new Error('INVALID_ATTRIBUTION');
  return v;
}
function assistanceBefore(input: AttributionInput, evidence: UsageEvidence) {
  const relevant = input.events.filter(e => e.relation !== 'no' && (e.kind !== 'exposure' || e.displayed));
  const before = relevant.filter(e => e.order !== null && evidence.order !== null && e.order < evidence.order);
  const knownLevels = [...new Set(before.filter(e => e.kind === 'exposure' && e.relation === 'yes').map(e => e.level))];
  const unknown = !input.traceComplete || evidence.order === null || relevant.some(e => e.order === null || e.order === evidence.order) || before.some(e => e.kind !== 'exposure' || e.relation === 'unknown');
  const assistance: Assistance = unknown ? 'unknown' : knownLevels.includes('full_reference') ? 'full_reference' : knownLevels.includes('english') ? 'english' : knownLevels.includes('chinese') ? 'chinese' : 'unprompted_observed';
  return { evidenceId: evidence.evidenceId, quote: evidence.quote, verdict: evidence.verdict, assistance, observedLevels: knownLevels, relatedEventIds: before.map(e => e.eventId) };
}
export function attributeUsage(value: AttributionInput) {
  const input = readAttributionInput(value);
  const final = input.observations.find(o => o.evidenceId === input.finalEvidenceId)!;
  const eligible = input.initialVersions === null ? 'unknown' : input.sourceDocumentId === input.documentId || !input.initialVersions.some(a => a.assetId === input.assetId && a.revision === input.revision) ? 'no' : 'yes';
  const supported = input.observations.filter(o => ['appropriate', 'alternate'].includes(o.verdict) && (o.evidenceId === final.evidenceId || final.order !== null && o.order !== null && o.order <= final.order)).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  // Exact prior quote is evidence of this wording; another correct wording remains a separate observation.
  const priorSame = supported.find(o => o.verdict === final.verdict && o.quote === final.quote);
  return {
    documentId: input.documentId, completionId: input.completionId, assetId: input.assetId, revision: input.revision,
    eligibility: eligible, basis: input.basis,
    earlierExpression: supported[0] ? assistanceBefore(input, supported[0]) : null,
    finalExpression: ['appropriate', 'alternate', 'inappropriate'].includes(final.verdict) ? assistanceBefore(input, priorSame ?? final) : null,
    verdict: final.verdict,
  };
}
export type ReuseObservation = ReturnType<typeof attributeUsage> & { valid: boolean };
export function countReusedDocuments(records: ReuseObservation[], assetId: string, revision: number, assistance?: Assistance): number {
  const latest = new Map<string, ReuseObservation>();
  for (const record of records) latest.set(JSON.stringify([record.documentId, record.completionId, record.assetId, record.revision]), record);
  return new Set([...latest.values()].filter(r => r.valid && r.assetId === assetId && r.revision === revision && r.eligibility === 'yes' && r.verdict === 'appropriate' && r.finalExpression && (!assistance || r.finalExpression.assistance === assistance)).map(r => r.documentId)).size;
}
