export type QualityInput = { assetId: string; revision: number; meaningZh: string; expression: string; conditions: string; sourceQuote: string; sourceEssay: string | null };
export type AssetQualityResult = { quality: 'usable' | 'unusable' | 'unknown'; reason: 'ok' | 'english_error' | 'meaning_mismatch' | 'source_mismatch' | 'uncertain' };

export function readQualityInput(value: unknown): QualityInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const input = value as QualityInput;
  const limits = { assetId: 200, meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000 };
  if (Object.keys(input).length !== 7 || Object.keys(input).some(k => ![...Object.keys(limits), 'revision', 'sourceEssay'].includes(k)) || Object.entries(limits).some(([k, limit]) => typeof input[k as keyof QualityInput] !== 'string' || (input[k as keyof QualityInput] as string).length > limit) || !input.assetId.trim() || !input.meaningZh.trim() || !input.expression.trim() || !Number.isSafeInteger(input.revision) || input.revision < 1 || !(input.sourceEssay === null || typeof input.sourceEssay === 'string' && input.sourceEssay.length <= 20000)) throw new Error('INVALID_INPUT');
  return input;
}

export function readQualityResult(value: unknown): AssetQualityResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_OUTPUT');
  const result = value as AssetQualityResult;
  if (Object.keys(result).length !== 2 || !Object.hasOwn(result, 'quality') || !Object.hasOwn(result, 'reason') || !(result.quality === 'usable' && result.reason === 'ok' || result.quality === 'unknown' && result.reason === 'uncertain' || result.quality === 'unusable' && ['english_error', 'meaning_mismatch', 'source_mismatch'].includes(result.reason))) throw new Error('INVALID_OUTPUT');
  return { quality: result.quality, reason: result.reason };
}
