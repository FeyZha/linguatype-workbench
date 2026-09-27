import { INTENT_HELP_VERSION, readHelpPackage, type HelpPackage } from './help-package.ts';
import type { EssayDocument, SupportCard } from './workspace-state';
import type { RetrievalRecord } from './help-request';
import type { LanguageAsset } from './language-assets';

export const INTENT_ENTRY_VERSION = 'vnext-intent-entry-v1';
export type IntentDraft = { intentZh: string; englishAttempt: string };
export type IntentGenerationMeta = { model: string; promptVersion: string; callCount: 1; latencyMs: number };
export type IntentCard = Omit<SupportCard, 'anchor'> & { inputVersion: typeof INTENT_ENTRY_VERSION; intent: IntentDraft; generationMeta: IntentGenerationMeta | null };

export function isIntentDraft(value: unknown): value is IntentDraft {
  const v = value as IntentDraft | null;
  return !!v && Object.keys(v).length === 2 && typeof v.intentZh === 'string' && v.intentZh.length <= 1500 && typeof v.englishAttempt === 'string' && v.englishAttempt.length <= 3000;
}

export function isIntentGenerationMeta(value: unknown): value is IntentGenerationMeta | null {
  if (value === null) return true;
  const v = value as IntentGenerationMeta | null;
  return !!v && Object.keys(v).length === 4 && typeof v.model === 'string' && !!v.model && v.model.length <= 200 && typeof v.promptVersion === 'string' && v.promptVersion.startsWith('vnext-intent-scaffold-') && v.promptVersion.length <= 150 && v.callCount === 1 && Number.isFinite(v.latencyMs) && v.latencyMs >= 0;
}

export function isIntentCards(value: unknown): value is IntentCard[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const ids = new Set<string>();
  return value.every(c => {
    if (!c || typeof c.cardId !== 'string' || !c.cardId || ids.has(c.cardId) || typeof c.requestToken !== 'string' || !c.requestToken || !isIntentDraft(c.intent) || !c.intent.intentZh.trim() || !c.request || typeof c.request.taskPrompt !== 'string' || !c.request.taskPrompt.trim() || c.request.taskPrompt.length > 4000 || typeof c.request.essay !== 'string' || c.request.essay.length > 20000 || c.request.targetSentence !== c.intent.intentZh.trim() || !Number.isFinite(Date.parse(c.request.requestedAt)) || !Number.isFinite(Date.parse(c.createdAt)) || c.result !== null || !['loading', 'ready', 'error'].includes(c.status) || !Array.isArray(c.revealedScaffolds) || c.revealedScaffolds.some((k: unknown) => typeof k !== 'string') || ![null, 'helpful', 'not_helpful'].includes(c.feedback) || typeof c.feedbackReason !== 'string' || !(c.error === null || typeof c.error === 'string') || !isIntentGenerationMeta(c.generationMeta)) return false;
    if (c.inputVersion !== INTENT_ENTRY_VERSION || !/[\u3400-\u9fff]/.test(c.intent.intentZh) || typeof c.request.requestedAt !== 'string' || typeof c.createdAt !== 'string') return false;
    ids.add(c.cardId);
    try {
      if (c.helpPackage) { readHelpPackage(c.helpPackage); if (c.helpPackage.version !== INTENT_HELP_VERSION || (c.helpPackage.meta.generationCalls === 1) !== (c.generationMeta !== null)) return false; }
      return c.status !== 'ready' || !!c.helpPackage;
    } catch { return false; }
  });
}

export function finishIntentRequest(document: EssayDocument, cardId: string, token: string, result: { pack: HelpPackage; retrieval: RetrievalRecord; generationMeta: IntentGenerationMeta | null } | null, assets: LanguageAsset[]): EssayDocument {
  return { ...document, intentCards: document.intentCards?.map(c => {
    if (c.cardId !== cardId || c.requestToken !== token || c.status !== 'loading') return c;
    if (!result || result.pack.items.some(i => i.kind === 'saved' && !assets.some(a => a.assetId === i.assetId && a.revision === i.assetRevision && a.quality === 'usable' && a.qualityReview?.revision === a.revision))) return { ...c, status: 'error' as const, error: '这次未能准备支架，或关联素材已变更。输入与正文已保留，可以重试。' };
    return { ...c, helpPackage: result.pack, retrieval: result.retrieval, generationMeta: result.generationMeta, status: 'ready' as const, error: null };
  }) };
}
