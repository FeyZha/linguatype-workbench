import type { ScaffoldItem } from './scaffold-api-contract';
import { isScaffoldItem, isIntentScaffoldItem } from './scaffold-response.ts';

export const HELP_VERSION = 'vnext-help-v2-asset-revision';
export const INTENT_HELP_VERSION = 'vnext-help-v3-intent-semantic-labels';
export type HelpItem = { itemId: string; sourceZh: string } & (
  | { kind: 'saved'; assetId: string; assetRevision: number | null; meaningZh: string; expression: string; conditions: string; sourceQuote: string }
  | { kind: 'new'; scaffold: ScaffoldItem }
);
export type HelpPackage = { version: typeof HELP_VERSION | typeof INTENT_HELP_VERSION; items: HelpItem[]; meta: { generationCalls: number } };

export function readHelpPackage(value: unknown): HelpPackage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESPONSE');
  const p = value as HelpPackage;
  const ids = new Set<string>();
  if (Object.keys(p).length !== 3 || ![HELP_VERSION, INTENT_HELP_VERSION].includes(p.version) || !p.meta || Object.keys(p.meta).length !== 1 || ![0, 1].includes(p.meta.generationCalls) || !Array.isArray(p.items) || !p.items.length || p.items.length > 20) throw new Error('INVALID_RESPONSE');
  for (const item of p.items) {
    if (!item || typeof item.itemId !== 'string' || !/^i\d+$/.test(item.itemId) || ids.has(item.itemId) || typeof item.sourceZh !== 'string' || !item.sourceZh.trim()) throw new Error('INVALID_RESPONSE');
    ids.add(item.itemId);
    if (item.kind === 'new') {
      if (Object.keys(item).length !== 4 || !(p.version === INTENT_HELP_VERSION ? isIntentScaffoldItem(item.scaffold) : isScaffoldItem(item.scaffold)) || item.scaffold.sourceZh !== item.sourceZh) throw new Error('INVALID_RESPONSE');
    } else if (item.kind === 'saved') {
      const limits = { assetId: 200, meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000 };
      if (Object.keys(item).length !== 9 || Object.entries(limits).some(([key, max]) => typeof item[key as keyof typeof item] !== 'string' || (item[key as keyof typeof item] as string).length > max) || !item.assetId || !item.meaningZh.trim() || !item.expression.trim() || !item.sourceQuote.trim() || !Number.isSafeInteger(item.assetRevision) || (item.assetRevision ?? 0) < 1) throw new Error('INVALID_RESPONSE');
    } else throw new Error('INVALID_RESPONSE');
  }
  if (p.meta.generationCalls === 0 && p.items.some(i => i.kind === 'new')) throw new Error('INVALID_RESPONSE');
  return p;
}

// Keep hidden content out of the DOM, previews and accessibility text alike.
export function visibleHelp(items: HelpItem[], revealed: string[] = []) {
  return items.map(item => item.kind === 'saved'
    ? { itemId: item.itemId, sourceZh: item.sourceZh, kind: item.kind, meaningZh: item.meaningZh, ...(revealed.includes(item.itemId) ? { expression: item.expression, sourceQuote: item.sourceQuote, conditions: item.conditions } : {}) }
    : { itemId: item.itemId, sourceZh: item.sourceZh, kind: item.kind, ...(item.scaffold.action === 'provide_expression'
      ? { expression: item.scaffold.recommendedExpression }
      : { scaffolds: item.scaffold.scaffolds.map(s => ({ scaffoldId: s.scaffoldId, focusZh: s.focusZh, ...(revealed.includes(`${item.itemId}:${s.scaffoldId}`) ? { expression: s.recommendedExpression } : {}) })) }) });
}
