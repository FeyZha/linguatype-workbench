import { readIdeaReuseInput } from './idea-reuse.ts';
import { readReasonReuseInput } from './reason-reuse.ts';
import { readHelpEvents, type HelpRelationInput } from './server/help-relevance.ts';
import type { ContentAsset } from './idea-usage.ts';
export type ContentRelationInput = { taskPrompt: string; essay: string; asset: ContentAsset; events: HelpRelationInput['events'] };
export function readContentRelationInput(value: unknown): ContentRelationInput {
  const v = value as ContentRelationInput;
  if (!v || typeof v !== 'object' || Object.keys(v).length !== 4 || !v.asset || typeof v.asset !== 'object') throw new Error('INVALID_INPUT');
  const input = { taskPrompt: v.taskPrompt, essay: v.essay, asset: v.asset };
  const checked = 'nodes' in v.asset ? readReasonReuseInput(input) : readIdeaReuseInput(input);
  return { ...checked, events: structuredClone(readHelpEvents(v.events)) };
}
