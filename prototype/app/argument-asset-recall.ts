import { isArgumentAssets, type ArgumentAsset, type ThoughtAsset } from './argument-assets.ts';

export const ARGUMENT_ASSET_RECALL_API_PATH = '/api/argument-asset-recall';
export const ARGUMENT_ASSET_RECALL_PROMPT_VERSION = 'thought-recall-v22-current-question';

export type ArgumentAssetRecallMatch = { assetId: string };

export function argumentAssetRecallMetadata(assets: ArgumentAsset[]) {
  return assets.filter((asset): asset is ThoughtAsset => asset.kind === 'thought' && asset.status === 'active').map(asset => ({
    assetId: asset.assetId,
    thought: asset.thought,
    useWhen: asset.useWhen ?? null,
    rationale: asset.rationale ?? null,
    limits: asset.limits ?? [],
  }));
}

export function readArgumentAssetRecallResult(value: unknown, assets: ArgumentAsset[]) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const data = value as Record<string, unknown>;
  const allowed = new Set(assets.filter(asset => asset.kind === 'thought' && asset.status === 'active').map(asset => asset.assetId));
  const seen = new Set<string>();
  if (data.version !== 3 || !Array.isArray(data.matches) || data.matches.length > 3 || !data.meta || typeof data.meta !== 'object') throw new Error('INVALID_RESPONSE');
  const matches = data.matches.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => key !== 'assetId') || typeof item.assetId !== 'string' || !allowed.has(item.assetId) || seen.has(item.assetId)) throw new Error('INVALID_RESPONSE');
    seen.add(item.assetId);
    return { assetId: item.assetId };
  });
  const meta = data.meta as Record<string, unknown>;
  if (meta.promptVersion !== ARGUMENT_ASSET_RECALL_PROMPT_VERSION || ![0, 1, 2, 3, 4].includes(meta.callCount as number) || !(meta.model === null || typeof meta.model === 'string') || typeof meta.latencyMs !== 'number' || meta.latencyMs < 0) throw new Error('INVALID_RESPONSE');
  return { matches, meta };
}

export function readArgumentAssetRecallInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const data = value as Record<string, unknown>, taskPrompt = typeof data.taskPrompt === 'string' ? data.taskPrompt.trim() : '', currentDraft = typeof data.currentDraft === 'string' ? data.currentDraft.trim() : '';
  if (Object.keys(data).some(key => !['taskPrompt', 'currentDraft', 'assets'].includes(key)) || !taskPrompt || taskPrompt.length > 4000 || currentDraft.length > 8000 || !isArgumentAssets(data.assets) || data.assets.length > 100 || data.assets.some(asset => asset.status !== 'active')) throw new Error('INVALID_INPUT');
  return { taskPrompt, currentDraft, assets: argumentAssetRecallMetadata(data.assets) };
}
