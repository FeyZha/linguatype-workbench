import { textHash } from './essay-feedback.ts';
import { readTopicAssetCandidate, type TopicAssetCandidate } from './topic-assets.ts';
import { isArgumentAssetDecision, type ArgumentAssetDecision } from './argument-assets.ts';

export type CompletedArticleVersion = {
  id: string;
  documentId: string;
  sourceTitle: string;
  taskPrompt: string;
  snapshot: string;
  essayHash: string;
  confirmedAt: string;
  saveReason: string;
  status: 'pending' | 'loading' | 'ready' | 'error' | 'saved' | 'empty';
  requestId: string | null;
  candidate: TopicAssetCandidate | null;
  meta: { model: string; promptVersion: string } | null;
  error: string | null;
  assetPackId?: string;
  assetRevision?: number;
  argumentDecision?: ArgumentAssetDecision;
};

const text = (value: unknown, max: number, required = true): value is string => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
const date = (value: unknown) => text(value, 100) && Number.isFinite(Date.parse(value));

export async function createCompletedVersion(
  source: { documentId: string; sourceTitle: string; taskPrompt: string; snapshot: string },
  id: string,
  confirmedAt: string,
  saveReason: string,
): Promise<CompletedArticleVersion> {
  if (!text(source.documentId, 200) || !text(source.sourceTitle, 4000) || !text(source.taskPrompt, 4000) || !text(source.snapshot, 20000) || !text(id, 200) || !date(confirmedAt) || !text(saveReason, 300, false)) throw new Error('INVALID_COMPLETION');
  return { ...source, id, confirmedAt, saveReason, essayHash: await textHash(source.snapshot), status: 'pending', requestId: null, candidate: null, meta: null, error: null };
}

export function isCompletedVersions(value: unknown): value is CompletedArticleVersion[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  return value.every((record: CompletedArticleVersion) => {
    if (!record || typeof record !== 'object' || !text(record.id, 200) || ids.has(record.id) || !text(record.documentId, 200) || !text(record.sourceTitle, 4000) || !text(record.taskPrompt, 4000) || !text(record.snapshot, 20000) || typeof record.essayHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.essayHash) || !date(record.confirmedAt) || !text(record.saveReason, 300, false) || !['pending', 'loading', 'ready', 'error', 'saved', 'empty'].includes(record.status) || !(record.requestId === null || text(record.requestId, 200)) || !(record.error === null || text(record.error, 5000))) return false;
    if (!(record.meta === null || record.meta && text(record.meta.model, 200) && text(record.meta.promptVersion, 200))) return false;
    if (record.assetPackId !== undefined || record.assetRevision !== undefined) {
      if (!text(record.assetPackId, 200) || !Number.isSafeInteger(record.assetRevision) || record.assetRevision! < 1) return false;
    }
    if (record.argumentDecision !== undefined && !isArgumentAssetDecision(record.argumentDecision)) return false;
    if (record.status === 'loading' && (record.requestId === null || record.error !== null) || record.status === 'ready' && (record.candidate === null || record.meta === null) || record.status === 'saved' && record.assetPackId === undefined) return false;
    if (record.candidate !== null) {
      // An unfinished explanation is recoverable draft input; source evidence is still checked.
      try { readTopicAssetCandidate(record.candidate, record.snapshot, true); } catch { return false; }
    }
    ids.add(record.id);
    return true;
  });
}

export function recoverCompletedVersions(records: CompletedArticleVersion[]): CompletedArticleVersion[] {
  return records.map(record => record.status === 'loading'
    ? { ...record, status: 'error', requestId: null, error: '上次整理已中断，完成版本和已检查内容已保留，请重试。' }
    : record);
}
