import data from './demo-simulated-learner.json' with { type: 'json' };
import { isArgumentAssets, isArgumentAssetUsages, type ArgumentAsset, type ArgumentAssetUsage } from './argument-assets.ts';
import { migrateExpressionFavorites, type ExpressionMemory } from './expression-memory.ts';
import { createEssayDocument, type EssayDocument, type ExpressionFavorite } from './workspace-state.ts';

export const SIMULATED_LEARNER_NOTICE = data.syntheticNotice;

export function createSimulatedLearnerWorkspace(): {
  documents: EssayDocument[];
  argumentAssets: ArgumentAsset[];
  argumentAssetUsages: ArgumentAssetUsage[];
  expressionMemories: ExpressionMemory[];
} {
  const documents = data.documents.map(document => ({
    ...createEssayDocument(document.documentId, document.createdAt, { taskPrompt: document.taskPrompt, essay: document.essay, promptSource: { kind: 'custom' } }),
    updatedAt: document.updatedAt,
  }));
  const argumentAssets = data.argumentAssets.map(({ lastUsedAt, limits, ...asset }) => {
    const normalizedLimits = (Array.isArray(limits) ? limits : [limits]).filter((value): value is string => typeof value === 'string' && !!value);
    return { ...structuredClone(asset), ...(normalizedLimits.length ? { limits: normalizedLimits } : {}), ...(lastUsedAt ? { lastUsedAt } : {}) };
  }) as ArgumentAsset[];
  const argumentAssetUsages = structuredClone(data.argumentAssetUsages) as ArgumentAssetUsage[];
  const favoriteExpressions = structuredClone(data.favoriteExpressions) as ExpressionFavorite[];
  const expressionMemories = migrateExpressionFavorites(favoriteExpressions);
  const documentIds = new Set(documents.map(document => document.documentId));
  if (documents.length !== 10 || !isArgumentAssets(argumentAssets) || !isArgumentAssetUsages(argumentAssetUsages, argumentAssets)
    || expressionMemories.length !== 10 || expressionMemories.some(item => !documentIds.has(item.documentId) || !item.english || !item.chinese || item.revealCount !== 1 || item.status !== 'active')) {
    throw new Error('INVALID_SIMULATED_LEARNER_DEMO');
  }
  return { documents, argumentAssets, argumentAssetUsages, expressionMemories };
}
