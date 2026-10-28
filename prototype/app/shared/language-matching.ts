export type MatchAsset = { assetId: string; revision?: number; meaningZh: string; expression: string; conditions: string; sourceQuote: string; type: string; confirmed: boolean; quality: 'usable' | 'unreviewed' | 'unusable' | 'unknown'; deleted: boolean };
export type MatchingInput = { taskPrompt: string; fullEssay: string; targetSentence: string; items: { itemId: string; sourceZh: string }[]; assets: MatchAsset[] };
export type LanguageMatch = { itemId: string; assetId: string | null; coverage: 'full' | 'partial' | 'none' };

export function lockedMatchItems(target: string) {
  return (target.match(/[\u3400-\u9fff]+(?:[，、；：！？（）“”‘’·—][\u3400-\u9fff]+)*/g) ?? []).map((sourceZh, i) => ({ itemId: `i${i + 1}`, sourceZh }));
}

export function readMatchingInput(value: unknown): MatchingInput {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const input = value as MatchingInput;
  if (Object.keys(input).some(k => !['taskPrompt', 'fullEssay', 'targetSentence', 'items', 'assets'].includes(k)) || typeof input.taskPrompt !== 'string' || !input.taskPrompt.trim() || input.taskPrompt.length > 4000 || typeof input.fullEssay !== 'string' || !input.fullEssay.trim() || input.fullEssay.length > 20000 || typeof input.targetSentence !== 'string' || !input.targetSentence.trim() || input.targetSentence.length > 3000 || !input.fullEssay.includes(input.targetSentence) || !Array.isArray(input.items) || input.items.length > 20 || input.items.length !== lockedMatchItems(input.targetSentence).length || input.items.some((item, i) => !item || Object.keys(item).length !== 2 || typeof item.itemId !== 'string' || !/^i\d+$/.test(item.itemId) || input.items.findIndex(other => other.itemId === item.itemId) !== i || item.sourceZh !== lockedMatchItems(input.targetSentence)[i].sourceZh) || !Array.isArray(input.assets) || input.assets.length > 100) throw new Error('INVALID_INPUT');
  readMatchAssets(input.assets);
  return input;
}

export function readMatchAssets(value: unknown): MatchAsset[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('INVALID_INPUT');
  const assets = value as MatchAsset[];
  const seen = new Set<string>();
  for (const a of assets) {
    const limits = { assetId: 200, meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000, type: 40 };
    if (!a || Object.keys(a).some(k => ![...Object.keys(limits), 'revision', 'confirmed', 'quality', 'deleted'].includes(k)) || Object.entries(limits).some(([key, limit]) => typeof a[key as keyof MatchAsset] !== 'string' || (a[key as keyof MatchAsset] as string).length > limit) || !a.assetId || seen.has(a.assetId) || !a.meaningZh.trim() || !a.expression.trim() || typeof a.confirmed !== 'boolean' || typeof a.deleted !== 'boolean' || !['usable', 'unreviewed', 'unusable', 'unknown'].includes(a.quality) || a.revision !== undefined && (!Number.isSafeInteger(a.revision) || a.revision < 1)) throw new Error('INVALID_INPUT');
    seen.add(a.assetId);
  }
  return assets;
}

export function eligibleMatchAssets(input: MatchingInput) {
  return input.assets.filter(a => a.type === 'language' && a.confirmed && !a.deleted && a.quality === 'usable' && a.sourceQuote.trim());
}

export function readMatchingRequest(value: unknown): MatchingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const body = value as Omit<MatchingInput, 'items'>;
  if (Object.keys(body).length !== 4 || Object.keys(body).some(k => !['taskPrompt', 'fullEssay', 'targetSentence', 'assets'].includes(k)) || typeof body.targetSentence !== 'string') throw new Error('INVALID_INPUT');
  const input = readMatchingInput({ ...body, items: lockedMatchItems(body.targetSentence) });
  if (!input.items.length || input.assets.some(a => !Number.isSafeInteger(a.revision) || (a.revision ?? 0) < 1)) throw new Error('INVALID_INPUT');
  return input;
}

export function readMatches(value: unknown, input: MatchingInput): LanguageMatch[] {
  const matches = (value as { matches?: unknown } | null)?.matches;
  if (!value || Object.keys(value).length !== 1 || !Array.isArray(matches) || matches.length !== input.items.length) throw new Error('INVALID_OUTPUT');
  const eligible = new Set(eligibleMatchAssets(input).map(a => a.assetId));
  return matches.map((m, i) => {
    if (!m || Object.keys(m).length !== 3 || Object.keys(m).some(k => !['itemId', 'assetId', 'coverage'].includes(k)) || m.itemId !== input.items[i].itemId || !['full', 'partial', 'none'].includes(m.coverage) || (m.coverage === 'none' ? m.assetId !== null : !eligible.has(m.assetId))) throw new Error('INVALID_OUTPUT');
    return { itemId: m.itemId, assetId: m.assetId, coverage: m.coverage };
  });
}
