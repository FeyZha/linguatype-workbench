import { readMatchAssets, type MatchAsset } from './server/language-matching.ts';

export type RecallInput = { taskPrompt: string; assets: MatchAsset[] };
export type RecallSelection = { assetId: string; revision: number };

export function readRecallInput(value: unknown): RecallInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const v = value as RecallInput;
  if (Object.keys(v).length !== 2 || Object.keys(v).some(k => !['taskPrompt', 'assets'].includes(k)) || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000) throw new Error('INVALID_INPUT');
  const assets = readMatchAssets(v.assets);
  if (assets.some(a => !Number.isSafeInteger(a.revision) || a.revision! < 1)) throw new Error('INVALID_INPUT');
  return structuredClone({ taskPrompt: v.taskPrompt, assets });
}

export function recallCandidates(input: RecallInput) {
  return input.assets.filter(a => a.type === 'language' && a.confirmed && !a.deleted && a.quality === 'usable' && a.sourceQuote.trim());
}

export function readRecallSelection(value: unknown, input: RecallInput): RecallSelection[] {
  return readRecallIds(value, recallCandidates(input));
}

export function readRecallIds(value: unknown, assets: { assetId: string; revision?: number }[]): RecallSelection[] {
  const ids = (value as { assetIds?: unknown } | null)?.assetIds;
  if (!value || Object.keys(value).length !== 1 || !Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length) throw new Error('INVALID_OUTPUT');
  return ids.map(id => {
    const asset = assets.find(a => a.assetId === id);
    if (!asset) throw new Error('INVALID_OUTPUT');
    return { assetId: asset.assetId, revision: asset.revision! };
  });
}
