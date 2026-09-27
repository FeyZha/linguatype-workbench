export type AnalysisFailure = 'request_failed' | 'invalid_response' | 'interrupted' | 'evidence_changed';
export function validAnalysisFailure(value: unknown, status: string) {
  return value === undefined || status === 'error' && ['request_failed', 'invalid_response', 'interrupted', 'evidence_changed'].includes(String(value)) && typeof value === 'string';
}
export function analysisFailure(error: unknown): AnalysisFailure {
  return error instanceof Error && /INVALID_(INPUT|OUTPUT|RESPONSE|RECORD)/.test(error.message) ? 'invalid_response' : 'request_failed';
}

export type QualityAttempt = { attemptId: string; revision: number; status: 'loading' | 'error'; errorKind?: AnalysisFailure };
export function validQualityAttempt(a: { revision: number; quality: string; qualityAttempt?: QualityAttempt }) {
  const q = a.qualityAttempt;
  return q === undefined || !!q && a.quality === 'unreviewed' && q.revision === a.revision && typeof q.attemptId === 'string' && !!q.attemptId && q.attemptId.length <= 200 && ['loading', 'error'].includes(q.status) && validAnalysisFailure(q.errorKind, q.status);
}
