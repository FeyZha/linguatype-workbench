export const FEEDBACK_API_PATH = '/api/feedback';
export const FEEDBACK_PROMPT_VERSION = 'essay-feedback-v7-ielts-task-requirements';

export type EssayFeedbackCriterion = 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammatical_range_accuracy';

export type EssayFeedbackSuggestion = {
  criterion?: EssayFeedbackCriterion;
  type: 'clarity' | 'reasoning' | 'redundancy' | 'logic' | 'example' | 'language' | 'cohesion';
  sourceQuote: string;
  problemZh: string;
  directionZh: string;
};

export type EssayFeedbackResult = {
  summary: string;
  suggestions: EssayFeedbackSuggestion[];
  meta: { model: string; promptVersion: string; callCount: 1 | 2; latencyMs: number };
};

export type FeedbackRun = {
  id: string;
  documentId: string;
  essayHash: string;
  essaySnapshot: string;
  createdAt: string;
  status: 'loading' | 'ready' | 'error';
  summary: string;
  suggestions: EssayFeedbackSuggestion[];
  model: string | null;
  promptVersion: string;
  error: string | null;
};

export function groupFeedbackSuggestions(sentenceKeys: string[]) {
  const groups = new Map<string, number[]>();
  sentenceKeys.forEach((key, index) => {
    const groupKey = key || `suggestion:${index}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), index]);
  });
  return [...groups].map(([key, indexes]) => ({ key, indexes }));
}

export function feedbackProblemText(value: string) {
  const firstChinese = value.search(/[\u3400-\u9fff]/);
  return firstChinese > 0 ? value.slice(firstChinese).trim() : value;
}

export function placeFeedbackNotes(anchorTops: Array<number | null>, heights: number[], viewportHeight: number, gap = 12, edge = 16) {
  const placed: number[] = [];
  let bottom = edge - gap;
  anchorTops.forEach((anchor, index) => {
    const top = Math.max(edge, anchor ?? edge, bottom + gap);
    placed.push(top);
    bottom = top + (heights[index] ?? 0);
  });
  const overflow = Math.max(0, bottom + edge - viewportHeight);
  const shift = Math.min(overflow, Math.max(0, (placed[0] ?? edge) - edge));
  return placed.map(top => top - shift);
}

export async function textHash(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readFeedbackInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['documentId', 'taskPrompt', 'essay'].includes(key))) throw new Error('INVALID_INPUT');
  const documentId = typeof input.documentId === 'string' ? input.documentId.trim() : '';
  const taskPrompt = typeof input.taskPrompt === 'string' ? input.taskPrompt.trim() : '';
  const essay = typeof input.essay === 'string' ? input.essay.trim() : '';
  if (!documentId || !taskPrompt || !essay || documentId.length > 200 || taskPrompt.length > 4000 || essay.length > 20000) throw new Error('INVALID_INPUT');
  return { documentId, taskPrompt, essay };
}

export function readFeedbackResult(value: unknown, essay: string, expectedPromptVersion = FEEDBACK_PROMPT_VERSION): EssayFeedbackResult {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RESPONSE');
  const data = value as Record<string, unknown>;
  if (typeof data.summary !== 'string' || !data.summary.trim() || data.summary.length > 500 || !Array.isArray(data.suggestions) || data.suggestions.length > 5 || !data.meta || typeof data.meta !== 'object') throw new Error('INVALID_RESPONSE');
  const suggestions = data.suggestions.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_RESPONSE');
    const item = raw as Record<string, unknown>;
    const sourceQuote = typeof item.sourceQuote === 'string' ? item.sourceQuote.trim() : '';
    const criteria = ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'];
    if (Object.keys(item).some(key => !['criterion', 'type', 'sourceQuote', 'problemZh', 'directionZh'].includes(key)) || expectedPromptVersion === FEEDBACK_PROMPT_VERSION && !criteria.includes(String(item.criterion)) || item.criterion !== undefined && !criteria.includes(String(item.criterion)) || !['clarity', 'reasoning', 'redundancy', 'logic', 'example', 'language', 'cohesion'].includes(String(item.type)) || !sourceQuote || sourceQuote.length > 2000 || !essay.includes(sourceQuote) || typeof item.problemZh !== 'string' || !item.problemZh.trim() || item.problemZh.length > 500 || typeof item.directionZh !== 'string' || !item.directionZh.trim() || item.directionZh.length > 500) throw new Error('INVALID_RESPONSE');
    return { ...(item.criterion ? { criterion: item.criterion as EssayFeedbackCriterion } : {}), type: item.type, sourceQuote, problemZh: item.problemZh.trim(), directionZh: item.directionZh.trim() } as EssayFeedbackSuggestion;
  });
  const meta = data.meta as Record<string, unknown>;
  if (typeof meta.model !== 'string' || !meta.model || meta.promptVersion !== expectedPromptVersion || ![1, 2].includes(Number(meta.callCount)) || typeof meta.latencyMs !== 'number' || meta.latencyMs < 0) throw new Error('INVALID_RESPONSE');
  return { summary: data.summary.trim(), suggestions, meta: meta as EssayFeedbackResult['meta'] };
}

export function isFeedbackRuns(value: unknown): value is FeedbackRun[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(run => {
    if (!run || typeof run.id !== 'string' || !run.id || ids.has(run.id) || typeof run.documentId !== 'string' || !run.documentId || typeof run.essayHash !== 'string' || !/^[a-f0-9]{64}$/.test(run.essayHash) || typeof run.essaySnapshot !== 'string' || !run.essaySnapshot || run.essaySnapshot.length > 20000 || typeof run.createdAt !== 'string' || !Number.isFinite(Date.parse(run.createdAt)) || !['loading', 'ready', 'error'].includes(run.status) || typeof run.summary !== 'string' || !Array.isArray(run.suggestions) || !(run.model === null || typeof run.model === 'string') || typeof run.promptVersion !== 'string' || !(run.error === null || typeof run.error === 'string')) return false;
    ids.add(run.id);
    if (run.status === 'ready') try {
      readFeedbackResult({ summary: run.summary, suggestions: run.suggestions, meta: { model: run.model, promptVersion: run.promptVersion, callCount: 1, latencyMs: 0 } }, run.essaySnapshot, run.promptVersion);
    } catch { return false; }
    return run.status !== 'loading' || run.error === null;
  });
}
