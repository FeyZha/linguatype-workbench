export const REUSE_VERDICTS = ['appropriate', 'inappropriate', 'alternate', 'absent', 'unknown'] as const;
export const REUSE_SCHEMA = { type: 'object', additionalProperties: false, required: ['complete', 'occurrences'], properties: { complete: { type: 'boolean' }, occurrences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['contextReadingsZh', 'verdict', 'quote'], properties: { contextReadingsZh: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['appropriate', 'inappropriate', 'alternate', 'unknown'] }, quote: { type: 'string' } } } } } };
const REUSE_REASONS = { appropriate: '这处用法保留了素材的含义与核心结构，当前接法合适。', inappropriate: '这处尝试采用了素材，但当前接法或含义不合适，不计正确使用。', alternate: '这处用其他英文表达了相近含义，单独记录，不计原素材复用。', absent: '完成稿未观察到该语言单位或同义表达的实际使用。', unknown: '当前上下文不足以确认这处是否采用了素材的义项，不计正确使用。' };
export type ReuseInput = { taskPrompt: string; essay: string; assetId: string; revision: number; meaningZh: string; expression: string; conditions: string; sourceQuote: string };
export type ReuseResult = { verdict: typeof REUSE_VERDICTS[number]; quote: string; reasonZh: string };
export function readReuseInput(value: unknown): ReuseInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const input = value as ReuseInput;
  const limits = { taskPrompt: 5000, essay: 20000, assetId: 200, meaningZh: 160, expression: 240, conditions: 400, sourceQuote: 2000 };
  if (Object.keys(input).length !== 8 || Object.keys(input).some(k => ![...Object.keys(limits), 'revision'].includes(k)) || Object.entries(limits).some(([k, max]) => typeof input[k as keyof ReuseInput] !== 'string' || (input[k as keyof ReuseInput] as string).length > max) || ![input.taskPrompt, input.assetId, input.meaningZh, input.expression, input.sourceQuote].every(s => s.trim()) || !Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('INVALID_INPUT');
  return input;
}
export function readReuseResult(value: unknown, input: ReuseInput): ReuseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_OUTPUT');
  const r = value as ReuseResult;
  if (Object.keys(r).length !== 3 || Object.keys(r).some(k => !['verdict', 'quote', 'reasonZh'].includes(k)) || !REUSE_VERDICTS.includes(r.verdict) || typeof r.quote !== 'string' || r.quote.length > 2000 || typeof r.reasonZh !== 'string' || !r.reasonZh.trim() || r.reasonZh.length > 600 || (r.quote && !input.essay.includes(r.quote)) || (['appropriate', 'inappropriate', 'alternate'].includes(r.verdict) && !r.quote.trim()) || (r.verdict === 'absent' && r.quote !== '')) throw new Error('INVALID_OUTPUT');
  return { verdict: r.verdict, quote: r.quote, reasonZh: r.reasonZh };
}
export function readReuseOccurrences(raw: unknown, input: ReuseInput): ReuseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_OUTPUT');
  const data = raw as { complete: boolean; occurrences: { verdict: ReuseResult['verdict']; quote: string; contextReadingsZh: string[] }[] };
  if (Object.keys(data).length !== 2 || typeof data.complete !== 'boolean' || !Array.isArray(data.occurrences) || data.occurrences.length > 20) throw new Error('INVALID_OUTPUT');
  const occurrences = data.occurrences.map(r => {
    if (!r || Object.keys(r).length !== 3 || !Array.isArray(r.contextReadingsZh) || r.contextReadingsZh.length > 3 || r.contextReadingsZh.some(s => typeof s !== 'string' || !s.trim() || s.length > 200)) throw new Error('INVALID_OUTPUT');
    const { contextReadingsZh, ...value } = r;
    const result = readReuseResult({ ...value, reasonZh: REUSE_REASONS[value.verdict] }, input);
    if (!result.quote.trim() || result.verdict === 'absent' || result.verdict !== 'unknown' && !contextReadingsZh.length) throw new Error('INVALID_OUTPUT');
    return result;
  });
  if (!data.complete) return { verdict: 'unknown', quote: '', reasonZh: '本次未核对全部相关用例，暂不汇总。' };
  const priority = ['appropriate', 'inappropriate', 'alternate', 'unknown'];
  occurrences.sort((a, b) => priority.indexOf(a.verdict) - priority.indexOf(b.verdict) || input.essay.indexOf(a.quote) - input.essay.indexOf(b.quote));
  return occurrences[0] ?? { verdict: 'absent', quote: '', reasonZh: REUSE_REASONS.absent };
}
