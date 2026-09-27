import { validAnalysisFailure, type AnalysisFailure } from './analysis-record.ts';
import { findSentences, hasChinese } from './sentence-tracking.ts';

export const REFERENCE_VERSION = 'vnext-sentence-reference-v1';
export type ReferenceInput = { version: typeof REFERENCE_VERSION; mode: 'intent' | 'mixed'; taskPrompt: string; fullEssay: string; target: string; englishAttempt: string };
export type ReferenceResult = { kind: 'reference'; sentence: string; questionZh: null } | { kind: 'clarification'; sentence: null; questionZh: string };
export type ReferenceMeta = { callCount: 1; promptVersion: string; model: string; latencyMs: number };
export type ReferenceResponse = { version: typeof REFERENCE_VERSION; result: ReferenceResult; meta: ReferenceMeta };
export type ReferenceRecord = { errorKind?: AnalysisFailure; referenceId: string; requestToken: string; input: ReferenceInput; requestedAt: string; status: 'loading' | 'ready' | 'error'; response: ReferenceResponse | null; continued: boolean; shownAt: string | null };

export function referenceKey(input: ReferenceInput) { return JSON.stringify([input.version, input.mode, input.taskPrompt, input.fullEssay, input.target, input.englishAttempt]); }

export function readReferenceResponse(value: unknown): ReferenceResponse {
  const v = value as ReferenceResponse | null;
  if (!v || Object.keys(v).length !== 3 || v.version !== REFERENCE_VERSION || !v.meta || Object.keys(v.meta).length !== 4 || v.meta.callCount !== 1 || typeof v.meta.promptVersion !== 'string' || !v.meta.promptVersion.startsWith('vnext-sentence-reference-') || v.meta.promptVersion.length > 150 || typeof v.meta.model !== 'string' || !v.meta.model || v.meta.model.length > 200 || !Number.isFinite(v.meta.latencyMs) || v.meta.latencyMs < 0) throw new Error('INVALID_OUTPUT');
  readReferenceResult(v.result);
  return v;
}

export function isReferenceRecords(value: unknown): value is ReferenceRecord[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>(), inputs = new Set<string>();
  try {
    for (const r of value) {
      if (!validAnalysisFailure(r?.errorKind, r?.status)) return false;
      if (!r || typeof r.referenceId !== 'string' || !r.referenceId || r.referenceId.length > 200 || ids.has(r.referenceId) || typeof r.requestToken !== 'string' || !r.requestToken || r.requestToken.length > 200 || typeof r.requestedAt !== 'string' || !Number.isFinite(Date.parse(r.requestedAt)) || !['loading', 'ready', 'error'].includes(r.status) || typeof r.continued !== 'boolean' || !(r.shownAt === null || typeof r.shownAt === 'string' && Number.isFinite(Date.parse(r.shownAt)))) return false;
      readReferenceInput(r.input);
      const key = referenceKey(r.input);
      if (inputs.has(key)) return false;
      inputs.add(key); ids.add(r.referenceId);
      if (r.status === 'ready') readReferenceResponse(r.response);
      else if (r.response !== null || r.shownAt !== null) return false;
      if (r.shownAt && r.response?.result.kind !== 'reference') return false;
    }
    return true;
  } catch { return false; }
}

export function finishReference(records: ReferenceRecord[], id: string, token: string, response: ReferenceResponse | null, errorKind: AnalysisFailure = 'request_failed'): ReferenceRecord[] {
  return records.map(r => r.referenceId === id && r.requestToken === token && r.status === 'loading' ? { ...r, response, errorKind: response ? undefined : errorKind, status: response ? 'ready' : 'error' } : r);
}

export function recoverReferences(records: ReferenceRecord[]) {
  return records.map(r => r.status === 'loading' ? { ...r, status: 'error' as const, errorKind: 'interrupted' as const } : r);
}

export function readReferenceInput(value: unknown): ReferenceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const v = value as ReferenceInput;
  const limits = { taskPrompt: 4000, fullEssay: 20000, target: 3000, englishAttempt: 3000 };
  if (Object.keys(v).length !== 6 || v.version !== REFERENCE_VERSION || !['intent', 'mixed'].includes(v.mode) || Object.entries(limits).some(([k, max]) => typeof v[k as keyof ReferenceInput] !== 'string' || v[k as keyof ReferenceInput].length > max) || !v.taskPrompt.trim() || !hasChinese(v.target) || findSentences(v.target).length !== 1 || v.mode === 'mixed' && (!v.fullEssay.includes(v.target) || v.englishAttempt !== '')) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}

export function readReferenceResult(value: unknown): ReferenceResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_OUTPUT');
  const v = value as ReferenceResult;
  if (Object.keys(v).length !== 3) throw new Error('INVALID_OUTPUT');
  if (v.kind === 'reference' && v.questionZh === null && typeof v.sentence === 'string' && !!v.sentence.trim() && v.sentence.length <= 3000 && !hasChinese(v.sentence) && /[a-z]/i.test(v.sentence) && findSentences(v.sentence).length === 1) return v;
  if (v.kind === 'clarification' && v.sentence === null && typeof v.questionZh === 'string' && hasChinese(v.questionZh) && v.questionZh.length <= 300) return v;
  throw new Error('INVALID_OUTPUT');
}
