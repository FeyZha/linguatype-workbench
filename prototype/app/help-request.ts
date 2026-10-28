import { HELP_VERSION, INTENT_HELP_VERSION, readHelpPackage } from './help-package.ts';
import type { MatchAsset, LanguageMatch } from './shared/language-matching';
import type { IntentInput } from './shared/intent-entry';
import { isIntentGenerationMeta, type IntentGenerationMeta } from './intent-help-state.ts';

export type HelpRequest = { taskPrompt: string; fullEssay: string; targetSentence: string; assets: MatchAsset[] };
export type RetrievalRecord = { outcome: 'matched' | 'skipped' | 'timeout' | 'unavailable' | 'no_candidates'; waitMs: number; requestStarted: boolean; completedModelCalls: number | null };

export async function requestHelp(value: HelpRequest | IntentInput, skip: AbortSignal, onPhase: (phase: 'searching' | 'generating', retrieval?: RetrievalRecord) => void) {
  const input = structuredClone(value);
  const intent = 'intentZh' in input;
  let matches: LanguageMatch[] | null = null;
  let retrieval: RetrievalRecord = { outcome: 'no_candidates', waitMs: 0, requestStarted: false, completedModelCalls: 0 };
  if (input.assets.length) {
    onPhase('searching');
    const started = performance.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let skipListener: () => void = () => {};
    type Decision = { outcome: RetrievalRecord['outcome']; matches: LanguageMatch[] | null; calls: number | null };
    const interrupted = new Promise<Decision>(resolve => {
      skipListener = () => resolve({ outcome: 'skipped', matches: null, calls: null });
      if (skip.aborted) skipListener();
      else skip.addEventListener('abort', skipListener, { once: true });
      timer = setTimeout(() => resolve({ outcome: 'timeout', matches: null, calls: null }), 1500);
    });
    const matched = (async (): Promise<Decision> => {
      try {
        const response = await fetch(intent ? '/api/intent-match' : '/api/language-match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
        if (!response.ok) throw new Error('MATCH_UNAVAILABLE');
        const result = await response.json();
        if (result.version !== 1 || !Array.isArray(result.matches) || !result.meta || ![0, 1].includes(result.meta.callCount)) throw new Error('INVALID_RESPONSE');
        return { outcome: 'matched', matches: result.matches, calls: result.meta.callCount };
      } catch { return { outcome: 'unavailable', matches: null, calls: null }; }
    })();
    const decision = await Promise.race([matched, interrupted]);
    clearTimeout(timer);
    skip.removeEventListener('abort', skipListener);
    if (decision.outcome !== 'matched') controller.abort();
    matches = decision.matches;
    retrieval = { outcome: decision.outcome, waitMs: Math.round(performance.now() - started), requestStarted: true, completedModelCalls: decision.calls };
  }
  onPhase('generating', retrieval);
  const response = await fetch(intent ? '/api/intent-help' : '/api/vnext-help', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, matches }), signal: AbortSignal.timeout(intent ? 35000 : 130000) });
  if (!response.ok) throw new Error('HELP_UNAVAILABLE');
  const body = await response.json();
  if (intent && (!body || Object.keys(body).length !== 2 || !isIntentGenerationMeta(body.generationMeta))) throw new Error('INVALID_RESPONSE');
  const pack = readHelpPackage(intent ? body.pack : body);
  if (pack.version !== (intent ? INTENT_HELP_VERSION : HELP_VERSION)) throw new Error('INVALID_RESPONSE');
  const generationMeta: IntentGenerationMeta | null = intent ? body.generationMeta : null;
  if (intent && (pack.meta.generationCalls === 1) !== (generationMeta !== null)) throw new Error('INVALID_RESPONSE');
  return { pack, retrieval, generationMeta };
}
