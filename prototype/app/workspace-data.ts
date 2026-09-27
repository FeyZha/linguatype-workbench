import { isPersistedWorkspace, recoverWorkspace, createEssayDocument, WORKSPACE_KEY, LEGACY_DRAFT_KEY, type PersistedWorkspace, type SupportCard } from './workspace-state.ts';
import { isSuccessResponse } from './scaffold-response.ts';
import { workspaceStorageKey } from './workspace-mode.ts';
import { EMPTY_ASSET_LIBRARY } from './language-assets.ts';
import { newWritingTrace } from './writing-trace.ts';

export const CONFLICT_KEY = workspaceStorageKey('linguatype:conflict:v2');
export const SESSION_EPOCH_KEY = workspaceStorageKey('linguatype:profile-epoch');
export const BACKUP_LIMIT = 20 * 1024 * 1024;
const text = (v: unknown, max: number, required = false): v is string => typeof v === 'string' && v.length <= max && (!required || !!v.trim());
const date = (v: unknown) => text(v, 100, true) && Number.isFinite(Date.parse(v));
function checkCard(c: SupportCard, anchored: boolean) {
  if (!c || !text(c.cardId, 200, true) || !c.request || !text(c.request.taskPrompt, 4000) || !text(c.request.essay, 20000) || !text(c.request.targetSentence, 3000) || !date(c.request.requestedAt) || !date(c.createdAt) || !Array.isArray(c.revealedScaffolds) || !c.revealedScaffolds.every(s => text(s, 200)) || !['loading', 'ready', 'error'].includes(c.status) || ![null, 'helpful', 'not_helpful'].includes(c.feedback) || !text(c.feedbackReason, 5000) || !(c.error === null || text(c.error, 5000))) throw new Error('INVALID_BACKUP');
  if (anchored && (!c.anchor || !text(c.anchor.text, 20000) || !Number.isSafeInteger(c.anchor.start) || !Number.isSafeInteger(c.anchor.end) || c.anchor.start < 0 || c.anchor.end < c.anchor.start || c.anchor.end > 20000)) throw new Error('INVALID_BACKUP');
  if (c.result !== null && !isSuccessResponse(c.result)) throw new Error('INVALID_BACKUP');
  if (c.retrieval && (!['matched', 'skipped', 'timeout', 'unavailable', 'no_candidates'].includes(c.retrieval.outcome) || !Number.isFinite(c.retrieval.waitMs) || c.retrieval.waitMs < 0 || typeof c.retrieval.requestStarted !== 'boolean' || ![null, 0, 1].includes(c.retrieval.completedModelCalls))) throw new Error('INVALID_BACKUP');
}
export function readWorkspaceBackup(raw: string): PersistedWorkspace {
  if (raw.length > BACKUP_LIMIT) throw new Error('INVALID_BACKUP');
  const value = JSON.parse(raw);
  if (!isPersistedWorkspace(value) || !date(value.savedAt) || !value.documents.length || value.documents.length > 1000 || !text(value.activeDocumentId, 200, true)) throw new Error('INVALID_BACKUP');
  const ids = new Set<string>();
  for (const d of value.documents) {
    if (!text(d.documentId, 200, true) || ids.has(d.documentId) || !text(d.taskPrompt, 4000) || !text(d.essay, 20000) || !date(d.createdAt) || !date(d.updatedAt) || !(d.archivedAt === null || date(d.archivedAt)) || !['active', 'archived'].includes(d.status) || !Array.isArray(d.supportCards) || !Array.isArray(d.archivedCards) || !(d.activeCardId === null || text(d.activeCardId, 200, true) && d.supportCards.some(c => c.cardId === d.activeCardId))) throw new Error('INVALID_BACKUP');
    if (d.promptSource && !(d.promptSource.kind === 'custom' || d.promptSource.kind === 'original_bank' && d.promptSource.promptVersion === 1 && [d.promptSource.promptId, d.promptSource.category, d.promptSource.title].every(s => text(s, 1000, true)))) throw new Error('INVALID_BACKUP');
    ids.add(d.documentId);
    for (const cards of [d.supportCards, d.archivedCards, ...d.completions?.map(c => c.helpCards) ?? []]) {
      if (cards.length > 1000 || new Set(cards.map(c => c.cardId)).size !== cards.length) throw new Error('INVALID_BACKUP');
      for (const card of cards) checkCard(card as SupportCard, !('intent' in card));
    }
    for (const card of d.archivedCards) if (!date(card.archivedAt)) throw new Error('INVALID_BACKUP');
  }
  if (!ids.has(value.activeDocumentId)) throw new Error('INVALID_BACKUP');
  // Imported conflict exports may carry another raw snapshot. Only the explicitly selected main copy is restored.
  const { documents, activeDocumentId, assetLibrary, favoriteExpressions, expressionMemories, topicAssetPacks, argumentAssets, argumentAssetUsages, savedAt } = value;
  return recoverWorkspace({ version: 2, documents, activeDocumentId, assetLibrary, favoriteExpressions, ...(expressionMemories !== undefined ? { expressionMemories } : {}), topicAssetPacks, ...(argumentAssets !== undefined ? { argumentAssets } : {}), ...(argumentAssetUsages !== undefined ? { argumentAssetUsages } : {}), savedAt, starterMaterialsLoaded: value.starterMaterialsLoaded === true });
}
export function profileEpoch(raw: string | null): string {
  try { const v = JSON.parse(raw ?? '{}').profileEpoch; return typeof v === 'string' ? v : ''; } catch { return ''; }
}
export function prepareEmptyWorkspace(id: string, now: string): PersistedWorkspace {
  const blank = { ...createEssayDocument(id, now), writingTrace: newWritingTrace([]) };
  return { version: 2, documents: [blank], activeDocumentId: id, assetLibrary: structuredClone(EMPTY_ASSET_LIBRARY), savedAt: now };
}
export function replaceWorkspace(storage: Pick<Storage, 'setItem' | 'removeItem'>, session: Pick<Storage, 'setItem' | 'removeItem'>, workspace: PersistedWorkspace, epoch: string) {
  // One atomic main write also changes the epoch: quota failure leaves the previous profile intact.
  storage.setItem(WORKSPACE_KEY, JSON.stringify({ ...workspace, starterMaterialsLoaded: true, profileEpoch: epoch }));
  storage.removeItem(LEGACY_DRAFT_KEY);
  session.removeItem(CONFLICT_KEY);
  // The marker has no user content; failed metadata writes are safe because startup rechecks the main epoch.
  try { session.setItem(SESSION_EPOCH_KEY, epoch); } catch { /* A full session quota must not turn a committed replacement into an apparent failure. */ }
}
