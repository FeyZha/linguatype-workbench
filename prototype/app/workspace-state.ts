import { workspaceStorageKey } from './workspace-mode.ts';
import type { SentenceSpan } from './sentence-tracking';
import type { ScaffoldSuccessResponse } from './scaffold-api-contract';
import { isAssetLibrary, setQualityAttempt, type AssetLibrary } from './language-assets.ts';
import { isWritingCompletions, type WritingCompletion } from './writing-completion.ts';
import { readHelpPackage, type HelpPackage } from './help-package.ts';
import { isWritingTrace, removeTraceAsset, recordWritingEvent, type WritingTrace } from './writing-trace.ts';
import type { RetrievalRecord } from './help-request';
import { isIntentCards, isIntentDraft, type IntentCard, type IntentDraft } from './intent-help-state.ts';
import { isReferenceRecords, recoverReferences, type ReferenceRecord } from './sentence-reference.ts';
import { isFeedbackRuns, type FeedbackRun } from './essay-feedback.ts';
import { isTopicAssetPacks, type TopicAssetPack } from './topic-assets.ts';
import { isCompletedVersions, recoverCompletedVersions, type CompletedArticleVersion } from './article-completion.ts';
import { isArgumentAssets, isArgumentAssetUsages, isArgumentReuseDrafts, type ArgumentAsset, type ArgumentAssetUsage, type ArgumentAssetReuseDraft } from './argument-assets.ts';
import { isExpressionMemories, type ExpressionMemory } from './expression-memory.ts';

export type { Scaffold, ScaffoldItem } from './scaffold-api-contract';
export type ScaffoldResult = ScaffoldSuccessResponse;

export type Feedback = 'helpful' | 'not_helpful' | null;
export type CardStatus = 'loading' | 'ready' | 'error';
export type ExpressionFavorite = {
  favoriteId: string;
  expression: string;
  meaningZh: string;
  sourceSentence: string;
  sourceDocumentId: string;
  sourcePrompt: string;
  createdAt: string;
};
function isExpressionFavorites(value: unknown): value is ExpressionFavorite[] {
  return Array.isArray(value) && value.every(favorite => favorite
    && typeof favorite.favoriteId === 'string' && favorite.favoriteId.length > 0
    && typeof favorite.expression === 'string' && favorite.expression.length > 0 && favorite.expression.length <= 5000
    && typeof favorite.meaningZh === 'string' && favorite.meaningZh.length > 0 && favorite.meaningZh.length <= 5000
    && typeof favorite.sourceSentence === 'string' && favorite.sourceSentence.length > 0 && favorite.sourceSentence.length <= 20000
    && typeof favorite.sourceDocumentId === 'string' && favorite.sourceDocumentId.length > 0
    && typeof favorite.sourcePrompt === 'string' && favorite.sourcePrompt.length > 0 && favorite.sourcePrompt.length <= 4000
    && typeof favorite.createdAt === 'string' && Number.isFinite(Date.parse(favorite.createdAt)));
}
export type HelpExposure = { sequence: number; requestToken: string; itemId: string; scaffoldId?: string; kind: 'saved_chinese' | 'saved_english' | 'saved_source' | 'new_direct' | 'new_focus' | 'new_scaffold'; content: string; essayBefore: string; shownAt: string; assetId?: string; assetRevision?: number };

function validHelpExposures(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  let sequence = 0;
  return value.every(e => {
    if (!e || !Number.isSafeInteger(e.sequence) || e.sequence <= sequence || ![e.requestToken, e.itemId, e.content, e.essayBefore, e.shownAt].every(v => typeof v === 'string') || !e.requestToken || !e.itemId || !e.content || e.content.length > 5000 || e.essayBefore.length > 20000 || !Number.isFinite(Date.parse(e.shownAt)) || !['saved_chinese', 'saved_english', 'saved_source', 'new_direct', 'new_focus', 'new_scaffold'].includes(e.kind) || e.scaffoldId !== undefined && typeof e.scaffoldId !== 'string' || e.assetId !== undefined && (typeof e.assetId !== 'string' || !Number.isSafeInteger(e.assetRevision) || e.assetRevision < 1)) return false;
    sequence = e.sequence;
    return true;
  });
}

export type RequestSnapshot = {
  taskPrompt: string;
  essay: string;
  targetSentence: string;
  requestedAt: string;
};

export type SupportCard = {
  requestToken?: string;
  helpPackage?: HelpPackage | null;
  retrieval?: RetrievalRecord;
  phase?: 'searching' | 'generating';
  helpExposures?: HelpExposure[];
  cardId: string;
  anchor: SentenceSpan;
  request: RequestSnapshot;
  result: ScaffoldResult | null;
  revealedScaffolds: string[];
  feedback: Feedback;
  feedbackReason: string;
  status: CardStatus;
  error: string | null;
  createdAt: string;
};

export type ArchivedCard = SupportCard & {
  archivedAt: string;
};

export type PromptSource =
  | {
      kind: 'original_bank';
      promptId: string;
      promptVersion: 1;
      category: string;
      title: string;
    }
  | { kind: 'custom' };

export type EssayDocument = {
  researchSource?: { kind: 'third_party_research'; essayId: string; sourceId: string; sourceQuestionId: string; title: string };
  completedVersions?: CompletedArticleVersion[];
  argumentReuseDrafts?: ArgumentAssetReuseDraft[];
  feedbackRuns?: FeedbackRun[];
  prewritingRequestedAt?: string;
  references?: ReferenceRecord[];
  intentCards?: IntentCard[];
  intentDraft?: IntentDraft;
  activeIntentId?: string | null;
  writingTrace?: WritingTrace;
  completions?: WritingCompletion[];
  documentId: string;
  taskPrompt: string;
  essay: string;
  promptSource?: PromptSource;
  supportCards: SupportCard[];
  archivedCards: ArchivedCard[];
  activeCardId: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type PersistedWorkspace = {
  starterMaterialsLoaded?: boolean;
  profileEpoch?: string;
  version: 2;
  assetLibrary?: AssetLibrary;
  favoriteExpressions?: ExpressionFavorite[];
  expressionMemories?: ExpressionMemory[];
  topicAssetPacks?: TopicAssetPack[];
  argumentAssets?: ArgumentAsset[];
  argumentAssetUsages?: ArgumentAssetUsage[];
  documents: EssayDocument[];
  activeDocumentId: string;
  savedAt: string;
};

export type LegacyDraft = {
  version: 1;
  taskPrompt: string;
  essay: string;
  supportCards: SupportCard[];
  archivedCards: ArchivedCard[];
  activeCardId: string | null;
  savedAt: string;
};

export const WORKSPACE_KEY = workspaceStorageKey('linguatype:workspace:v2');
export const LEGACY_DRAFT_KEY = workspaceStorageKey('linguatype:draft:v1');

export function createEssayDocument(
  documentId: string,
  now: string,
  content?: { taskPrompt?: string; essay?: string; promptSource?: PromptSource },
): EssayDocument {
  return {
    documentId,
    taskPrompt: content?.taskPrompt ?? '',
    essay: content?.essay ?? '',
    promptSource: content?.promptSource,
    supportCards: [],
    archivedCards: [],
    activeCardId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

export function isPersistedWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== 'object') return false;
  const workspace = value as Partial<PersistedWorkspace>;
  return (
    workspace.version === 2 &&
    typeof workspace.activeDocumentId === 'string' &&
    (workspace.favoriteExpressions === undefined || isExpressionFavorites(workspace.favoriteExpressions)) &&
    (workspace.expressionMemories === undefined || isExpressionMemories(workspace.expressionMemories)) &&
    Array.isArray(workspace.documents) &&
    workspace.documents.every(document => !document?.researchSource || document.researchSource.kind === 'third_party_research' && /^E\d{3}$/.test(document.researchSource.essayId) && [document.researchSource.sourceId, document.researchSource.sourceQuestionId, document.researchSource.title].every(value => typeof value === 'string' && value.length > 0 && value.length <= 4000)) &&
    workspace.documents.every(document => document && (document.completedVersions === undefined || isCompletedVersions(document.completedVersions) && document.completedVersions.every(version => version.documentId === document.documentId))) &&
    workspace.documents.every(document => document && (document.argumentReuseDrafts === undefined || isArgumentReuseDrafts(document.argumentReuseDrafts))) &&
    workspace.documents.every(document => document && (document.feedbackRuns === undefined || isFeedbackRuns(document.feedbackRuns) && document.feedbackRuns.every(run => run.documentId === document.documentId)) && (document.prewritingRequestedAt === undefined || typeof document.prewritingRequestedAt === 'string' && Number.isFinite(Date.parse(document.prewritingRequestedAt))) && (document.references === undefined || isReferenceRecords(document.references)) && (document.intentDraft === undefined || isIntentDraft(document.intentDraft)) && (document.intentCards === undefined || isIntentCards(document.intentCards)) && (document.activeIntentId === undefined || document.activeIntentId === null || typeof document.activeIntentId === 'string' && !!document.intentCards?.some(c => c.cardId === document.activeIntentId)) && (document.writingTrace === undefined || isWritingTrace(document.writingTrace)) && (document.completions === undefined || isWritingCompletions(document.completions) && document.completions.every(c => c.usageReviews?.every(r => !r.evidence || r.evidence.documentId === document.documentId) ?? true)) && [...document.supportCards ?? [], ...document.intentCards ?? [], ...document.archivedCards ?? [], ...document.completions?.flatMap(c => c.helpCards) ?? []].every(card => { try { if ('intent' in card && !isIntentCards([card])) return false; if (card.helpPackage) { readHelpPackage(card.helpPackage); if (typeof card.requestToken !== 'string' || !card.requestToken) return false; } return card.helpExposures === undefined || validHelpExposures(card.helpExposures); } catch { return false; } })) &&
    (workspace.assetLibrary === undefined || isAssetLibrary(workspace.assetLibrary)) &&
    (workspace.topicAssetPacks === undefined || isTopicAssetPacks(workspace.topicAssetPacks)) &&
    (workspace.argumentAssets === undefined || isArgumentAssets(workspace.argumentAssets)) &&
    (workspace.argumentAssetUsages === undefined || workspace.argumentAssets !== undefined && isArgumentAssetUsages(workspace.argumentAssetUsages, workspace.argumentAssets))
  );
}

export function isLegacyDraft(value: unknown): value is LegacyDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<LegacyDraft>;
  return (
    draft.version === 1 &&
    typeof draft.taskPrompt === 'string' &&
    typeof draft.essay === 'string' &&
    Array.isArray(draft.supportCards) &&
    Array.isArray(draft.archivedCards)
  );
}

function recoverCard<T extends Omit<SupportCard, 'anchor'>>(card: T): T {
  return card.status === 'loading'
    ? {
        ...card,
        status: 'error',
        error: '上次请求已中断，请重试这次求助。',
      }
    : card;
}

export function recoverWorkspace(workspace: PersistedWorkspace): PersistedWorkspace {
  let assetLibrary = workspace.assetLibrary;
  if (assetLibrary) for (const a of [...assetLibrary.assets, ...assetLibrary.ideas ?? [], ...assetLibrary.reasons ?? []]) {
    if (a.qualityAttempt?.status === 'loading') assetLibrary = setQualityAttempt(assetLibrary, a.assetId, a.revision, { ...a.qualityAttempt, status: 'error', errorKind: 'interrupted' });
  }
  return {
    ...workspace, ...(assetLibrary ? { assetLibrary } : {}),
    documents: workspace.documents.map((document) => ({
      ...document,
      ...(document.completedVersions ? { completedVersions: recoverCompletedVersions(document.completedVersions) } : {}),
      ...(document.feedbackRuns ? { feedbackRuns: document.feedbackRuns.map(run => run.status === 'loading' ? { ...run, status: 'error' as const, error: '上次修改建议请求已中断，请重新获取。' } : run) } : {}),
      ...(document.references ? { references: recoverReferences(document.references) } : {}),
      ...(document.intentCards ? { intentCards: document.intentCards.map(recoverCard) } : {}),
      ...(document.completions ? { completions: document.completions.map(c => ({ ...c, ...(c.reasonUsageReviews ? { reasonUsageReviews: c.reasonUsageReviews.map(r => r.status === 'loading' ? { ...r, status: 'error' as const, errorKind: 'interrupted' as const } : r) } : {}), ...(c.ideaUsageReviews ? { ideaUsageReviews: c.ideaUsageReviews.map(r => r.status === 'loading' ? { ...r, status: 'error' as const, errorKind: 'interrupted' as const } : r) } : {}), ...(c.reasons?.status === 'loading' ? { reasons: { ...c.reasons, status: 'error' as const, errorKind: 'interrupted' as const } } : {}), ...(c.ideas?.status === 'loading' ? { ideas: { ...c.ideas, status: 'error' as const, errorKind: 'interrupted' as const } } : {}), ...(c.references ? { references: recoverReferences(c.references) } : {}), ...(c.status === 'loading' ? { status: 'error' as const, attemptId: null, errorKind: 'interrupted' as const } : {}), ...(c.usageReviews ? { usageReviews: c.usageReviews.map(r => r.status === 'loading' ? { ...r, status: 'error' as const, errorKind: 'interrupted' as const } : r) } : {}) })) } : {}),
      supportCards: document.supportCards.map(recoverCard),
      archivedCards: document.archivedCards.map((card) => ({
        ...recoverCard(card),
        archivedAt: card.archivedAt,
      })),
    })),
  };
}

export function migrateLegacyDraft(
  draft: LegacyDraft,
  documentId: string,
  now: string,
): PersistedWorkspace {
  const document: EssayDocument = {
    documentId,
    taskPrompt: draft.taskPrompt,
    essay: draft.essay,
    supportCards: draft.supportCards.map(recoverCard),
    archivedCards: draft.archivedCards.map((card) => ({
      ...recoverCard(card),
      archivedAt: card.archivedAt,
    })),
    activeCardId: draft.activeCardId,
    status: 'active',
    createdAt: draft.savedAt || now,
    updatedAt: draft.savedAt || now,
    archivedAt: null,
  };

  return {
    version: 2,
    documents: [document],
    activeDocumentId: documentId,
    savedAt: now,
  };
}

// Restore saved work as-is; demo releases must never rewrite user documents.
export function loadWorkspace(
  storage: Pick<Storage, 'getItem'>,
  documentId: string,
  now: string,
): PersistedWorkspace | null {
  const stored = storage.getItem(WORKSPACE_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (!isPersistedWorkspace(parsed)) throw new Error('Invalid saved workspace');
    return recoverWorkspace(parsed);
  }
  const legacy = storage.getItem(LEGACY_DRAFT_KEY);
  if (!legacy) return null;
  const parsed: unknown = JSON.parse(legacy);
  if (!isLegacyDraft(parsed)) throw new Error('Invalid legacy draft');
  return migrateLegacyDraft(parsed, documentId, now);
}

export function documentTitle(document: EssayDocument) {
  const normalized = document.taskPrompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return '未命名作文';
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized;
}

export function addHelpExposure(document: EssayDocument, cardId: string, value: Omit<HelpExposure, 'sequence' | 'essayBefore'>): EssayDocument {
  let exposed = false;
  const add = <T extends Omit<SupportCard, 'anchor'>>(card: T): T => {
    const events = card.helpExposures ?? [];
    if (card.cardId !== cardId || card.requestToken !== value.requestToken || card.status !== 'ready' || events.some(e => e.requestToken === value.requestToken && e.itemId === value.itemId && e.scaffoldId === value.scaffoldId && e.kind === value.kind)) return card;
    exposed = true;
    return { ...card, helpExposures: [...events, { ...value, sequence: (events.at(-1)?.sequence ?? 0) + 1, essayBefore: document.essay }] };
  };
  const next = { ...document, supportCards: document.supportCards.map(add),
      ...(document.intentCards ? { intentCards: document.intentCards.map(add) } : {}) };
  return exposed ? recordWritingEvent(next, { eventId: JSON.stringify([value.requestToken, value.itemId, value.scaffoldId ?? '', value.kind]), kind: 'exposure', level: ['saved_chinese', 'new_focus'].includes(value.kind) ? 'chinese' : 'english', content: value.content, shownAt: value.shownAt, ...(value.assetId ? { assetId: value.assetId, revision: value.assetRevision } : {}) }) : next;
}

export function removeAssetHelp(document: EssayDocument, assetId: string): EssayDocument {
  const clear = <T extends Omit<SupportCard, 'anchor'>>(card: T): T => {
    const referencesAsset = card.helpPackage?.items.some(i => i.kind === 'saved' && i.assetId === assetId);
    return { ...card, ...(referencesAsset ? { helpPackage: null, status: 'error' as const, error: '相关素材已删除，请重新处理本句。' } : {}), ...(card.helpExposures ? { helpExposures: card.helpExposures.filter(e => e.assetId !== assetId) } : {}) };
  };
  return { ...document, ...(document.writingTrace ? { writingTrace: removeTraceAsset(document.writingTrace, assetId) } : {}), supportCards: document.supportCards.map(clear),
      ...(document.intentCards ? { intentCards: document.intentCards.map(clear) } : {}), archivedCards: document.archivedCards.map(clear), ...(document.completions ? { completions: document.completions.map(c => ({ ...c,  ...(c.reasonUsageReviews ? { reasonUsageReviews: c.reasonUsageReviews.filter(r => r.asset.assetId !== assetId).map(r => c.writingTrace?.events.some(e => e.assetId === assetId) ? { asset: r.asset, attemptId: r.attemptId, correction: r.correction, status: 'error' as const } : r) } : {}), ...(c.ideaUsageReviews ? { ideaUsageReviews: c.ideaUsageReviews.filter(r => r.asset.assetId !== assetId).map(r => c.writingTrace?.events.some(e => e.assetId === assetId) ? { asset: r.asset, attemptId: r.attemptId, correction: r.correction, status: 'error' as const } : r) } : {}), ...(c.usageReviews ? { usageReviews: c.usageReviews.filter(r => r.asset.assetId !== assetId).map(r => r.evidence && (r.evidence.initialVersions?.some(a => a.assetId === assetId) || r.evidence.events.some(e => c.writingTrace?.events.some(t => t.eventId === e.eventId && t.assetId === assetId))) ? { asset: r.asset, attemptId: r.attemptId, status: 'error' as const, correction: r.correction, correctionNote: r.correctionNote } : r) } : {}), ...(c.writingTrace ? { writingTrace: removeTraceAsset(c.writingTrace, assetId) } : {}), helpCards: c.helpCards.map(clear) })) } : {}) };
}

export function removeEssayReading(document: EssayDocument, sourceDocumentId: string): EssayDocument {
  const clearTrace = (trace: WritingTrace) => ({ ...trace, complete: trace.complete && !trace.events.some(e => e.sourceDocumentId === sourceDocumentId), events: trace.events.filter(e => e.sourceDocumentId !== sourceDocumentId) });
  return { ...document, ...(document.writingTrace ? { writingTrace: clearTrace(document.writingTrace) } : {}), completions: document.completions?.map(c => ({ ...c, ...(c.writingTrace ? { writingTrace: clearTrace(c.writingTrace) } : {}), reasonUsageReviews: c.reasonUsageReviews?.map(r => c.writingTrace?.events.some(e => e.sourceDocumentId === sourceDocumentId) ? { asset: r.asset, attemptId: r.attemptId, correction: r.correction, status: 'error' as const } : r), ideaUsageReviews: c.ideaUsageReviews?.map(r => c.writingTrace?.events.some(e => e.sourceDocumentId === sourceDocumentId) ? { asset: r.asset, attemptId: r.attemptId, correction: r.correction, status: 'error' as const } : r), usageReviews: c.usageReviews?.map(r => {
    const { historicalHelp, ...rest } = r;
    const next = historicalHelp?.sourceDocumentId === sourceDocumentId ? rest : r;
    return c.writingTrace?.events.some(e => e.sourceDocumentId === sourceDocumentId) ? { asset: next.asset, attemptId: next.attemptId, correction: next.correction, correctionNote: next.correctionNote, status: 'error' as const, historicalHelp: historicalHelp?.sourceDocumentId === sourceDocumentId ? undefined : historicalHelp } : next;
  }) })) };
}
