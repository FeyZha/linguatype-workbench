import { isReasonAssets, type ReasonAsset } from './reason-chains.ts';
import { readRecallIds } from './prewriting-recall.ts';
import { readIdeaReuseResult } from './idea-reuse.ts';
export type ReasonRecallInput = { taskPrompt: string; assets: ReasonAsset[] };
export type ReasonReuseInput = { taskPrompt: string; essay: string; asset: ReasonAsset };
export const eligibleReasons = (assets: ReasonAsset[]) => assets.filter(a => a.quality === 'usable' && a.qualityReview?.revision === a.revision);
export function readReasonRecallInput(value: unknown): ReasonRecallInput {
  const v = value as ReasonRecallInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 2 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || !isReasonAssets(v.assets) || v.assets.length > 100) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}
export function readReasonReuseInput(value: unknown): ReasonReuseInput {
  const v = value as ReasonReuseInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 3 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 4000 || typeof v.essay !== 'string' || v.essay.length > 20000 || !isReasonAssets([v.asset]) || !eligibleReasons([v.asset]).length) throw new Error('INVALID_INPUT');
  return structuredClone(v);
}
export const readReasonRecall = (value: unknown, input: ReasonRecallInput) => readRecallIds(value, eligibleReasons(input.assets));
// Both content types require ordered verbatim evidence; only their semantic model task differs.
export const readReasonReuseResult = readIdeaReuseResult;

export function readReasonReuseProof(value: unknown, input: ReasonReuseInput) {
  const v = value as { complete: boolean; occurrences: { quote: string; connections: { verdict: string; quote: string }[] }[] };
  if (!v || Object.keys(v).length !== 2 || typeof v.complete !== 'boolean' || !Array.isArray(v.occurrences) || v.occurrences.length > 20) throw new Error('INVALID_OUTPUT');
  const occurrences = v.occurrences.map(o => {
    if (!o || Object.keys(o).length !== 2 || !Array.isArray(o.connections) || o.connections.length !== input.asset.links.length) throw new Error('INVALID_OUTPUT');
    for (const edge of o.connections) {
      if (!edge || Object.keys(edge).length !== 2 || !['faithful', 'different', 'missing', 'unknown'].includes(edge.verdict) || typeof edge.quote !== 'string') throw new Error('INVALID_OUTPUT');
      if (edge.verdict === 'missing' ? edge.quote !== '' : !edge.quote || !o.quote.includes(edge.quote)) throw new Error('INVALID_OUTPUT');
      if (edge.quote) readReasonReuseResult({ complete: true, occurrences: [{ verdict: 'unknown', quote: edge.quote }] }, input);
    }
    const verdict = o.connections.some(e => e.verdict === 'unknown') ? 'unknown' : o.connections.some(e => e.verdict !== 'faithful') ? 'inappropriate' : 'appropriate';
    return { verdict, quote: o.quote };
  });
  return readReasonReuseResult({ complete: v.complete, occurrences }, input);
}
