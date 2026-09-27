import { isIdeaAssets, hasIdeaSource, type IdeaAsset } from './idea-assets.ts';
import { readRecallIds } from './prewriting-recall.ts';

export type IdeaRecallInput = { taskPrompt: string; assets: IdeaAsset[] };
export function readIdeaRecallInput(value: unknown): IdeaRecallInput {
  const v = value as IdeaRecallInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 2 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || !isIdeaAssets(v.assets) || v.assets.length > 100) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}
export function eligibleIdeas(assets: IdeaAsset[]) { return assets.filter(a => a.quality === 'usable' && a.qualityReview?.revision === a.revision); }
export function readIdeaRecall(value: unknown, input: IdeaRecallInput) { return readRecallIds(value, eligibleIdeas(input.assets)); }

export type IdeaReuseInput = { taskPrompt: string; essay: string; asset: IdeaAsset };
export type IdeaOccurrence = { verdict: 'appropriate' | 'inappropriate' | 'unknown'; quote: string };
export type IdeaReuseResult = { complete: boolean; occurrences: IdeaOccurrence[] };
export function readIdeaReuseInput(value: unknown): IdeaReuseInput {
  const v = value as IdeaReuseInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 3 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || typeof v.essay !== 'string' || v.essay.length > 20000 || !isIdeaAssets([v.asset]) || !eligibleIdeas([v.asset]).length) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}
export function readIdeaReuseResult<T extends Pick<IdeaReuseInput, 'essay'>>(value: unknown, input: T): IdeaReuseResult {
  const v = value as IdeaReuseResult;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 2 || typeof v.complete !== 'boolean' || !Array.isArray(v.occurrences) || v.occurrences.length > 20) throw new Error('INVALID_OUTPUT');
  let position = -1;
  const occurrences = v.occurrences.map(o => {
    if (!o || Object.keys(o).length !== 2 || !['appropriate', 'inappropriate', 'unknown'].includes(o.verdict) || typeof o.quote !== 'string' || !hasIdeaSource(input.essay, o.quote)) throw new Error('INVALID_OUTPUT');
    const next = input.essay.indexOf(o.quote, position + 1);
    if (next < 0) throw new Error('INVALID_OUTPUT');
    position = next;
    return { verdict: o.verdict, quote: o.quote };
  });
  return { complete: v.complete, occurrences };
}
