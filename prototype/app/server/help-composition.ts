import { readMatchingInput, readMatches, type MatchingInput, type LanguageMatch } from './language-matching.ts';
import { readScaffoldResponse } from '../scaffold-response.ts';
import type { ScaffoldRequest, ScaffoldItem } from '../scaffold-api-contract.ts';
import { HELP_VERSION, type HelpItem, type HelpPackage } from '../help-package.ts';

// Fixed, validated matches only. Matching calls are counted separately by the caller.
export async function composeHelp(
  value: MatchingInput,
  fixedMatches: LanguageMatch[],
  generate: (request: ScaffoldRequest) => Promise<Response>,
): Promise<HelpPackage> {
  // Snapshot before awaiting: later edits/deletions cannot change this help package.
  const input = structuredClone(readMatchingInput(value));
  const matches = readMatches({ matches: fixedMatches }, input);
  if (!input.items.length) throw new Error('INVALID_INPUT');
  let generated: ScaffoldItem[] = [];
  const needsGeneration = matches.some(m => m.coverage !== 'full');
  if (needsGeneration) {
    // ponytail: reuse frozen v7 for the whole sentence; discard full-match outputs.
    // Generate only unresolved items if redundant work becomes a measured cost.
    const response = await generate({ taskPrompt: input.taskPrompt, fullEssay: input.fullEssay, targetSentence: input.targetSentence });
    const parsed = await readScaffoldResponse(response, '1.0.0');
    if (!parsed.ok) throw new Error('HELP_GENERATION_FAILED');
    generated = parsed.result.items;
    if (generated.length !== input.items.length || generated.some((item, i) => item.sourceZh !== input.items[i].sourceZh)) throw new Error('HELP_SOURCE_MISMATCH');
  }
  return combineHelp(input, matches, generated);
}

// Both entry points use the same fixed-match projection; generation stays separate.
export function combineHelp(value: MatchingInput, fixedMatches: LanguageMatch[], generated: ScaffoldItem[], version: HelpPackage['version'] = HELP_VERSION): HelpPackage {
  const input = readMatchingInput(value), matches = readMatches({ matches: fixedMatches }, input);
  const needsGeneration = matches.some(m => m.coverage !== 'full');
  if (needsGeneration && (generated.length !== input.items.length || generated.some((item, i) => item.sourceZh !== input.items[i].sourceZh))) throw new Error('HELP_SOURCE_MISMATCH');
  const items: HelpItem[] = input.items.map((item, i) => {
    const match = matches[i];
    if (match.coverage !== 'full') return { ...item, kind: 'new', scaffold: generated[i] };
    const asset = input.assets.find(a => a.assetId === match.assetId)!;
    return { ...item, kind: 'saved', assetId: asset.assetId, assetRevision: asset.revision ?? null, meaningZh: asset.meaningZh, expression: asset.expression, conditions: asset.conditions, sourceQuote: asset.sourceQuote };
  });
  return { version, items, meta: { generationCalls: needsGeneration ? 1 : 0 } };
}
