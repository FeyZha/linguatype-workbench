import { createPrototypeResult } from '../app/prototype-cases.ts';
import { SCAFFOLD_API_VERSION } from '../app/scaffold-api-contract.ts';
import { FEEDBACK_PROMPT_VERSION } from '../app/essay-feedback.ts';
import { FULLTEXT_PROMPT_VERSION, readFulltextInput, fulltextModelInput, bindFulltextOutput } from '../app/fulltext-recall.ts';
import { DIGITAL_PROMPT, UNIVERSITY_PROMPT, SPACE_PROMPT, REVIEW_ESSAY, SOURCE_ESSAY, SOURCE_QUOTE } from './workspace.ts';

const unavailable = () => Response.json({ error: '这个输入没有预置结果。请切换上方体验场景，或重置样例后重试；你的正文仍然保留。' }, { status: 422 });

/** A local response adapter. It has no fetch, credentials, model SDK or network fallback. */
export async function demoFetch(path: string, options: RequestInit = {}): Promise<Response> {
  options.signal?.throwIfAborted();
  let body: Record<string, unknown>;
  try { body = JSON.parse(String(options.body ?? '{}')); }
  catch { return unavailable(); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return unavailable();
  if (path === '/api/scaffold') {
    if (body.taskPrompt !== DIGITAL_PROMPT || typeof body.targetSentence !== 'string' || typeof body.fullEssay !== 'string' || !body.fullEssay.includes(body.targetSentence)) return unavailable();
    const result = createPrototypeResult(body.targetSentence);
    return result ? Response.json({ ...result, meta: { ...result.meta, model: 'built-in-demo', latencyMs: 0 } }, { headers: { 'x-linguatype-api-version': SCAFFOLD_API_VERSION } }) : unavailable();
  }
  if (path === '/api/feedback') {
    if (body.taskPrompt !== DIGITAL_PROMPT || ![REVIEW_ESSAY, SOURCE_ESSAY].includes(String(body.essay))) return unavailable();
    return Response.json({ summary: '预置审阅：检查论述是否具体，结论是否超出证据。', suggestions: body.essay === SOURCE_ESSAY ? [] : [
      { criterion: 'coherence_cohesion', type: 'reasoning', sourceQuote: 'These alternatives are good for everyone.', problemZh: '“对所有人都有好处”过于宽泛，还看不出面对面和电话渠道具体帮助谁。', directionZh: '说明哪些人需要这些渠道，以及工作人员能帮助他们解决什么困难。' },
      { criterion: 'task_response', type: 'logic', sourceQuote: 'This will solve all access problems.', problemZh: '公共设备和帮助只能缓解部分障碍，“解决所有问题”超出了前文支持。', directionZh: '缩小结论范围，区分设备、数字技能与无障碍设计各自解决的问题。' },
    ], meta: { model: 'built-in-demo', promptVersion: FEEDBACK_PROMPT_VERSION, callCount: 1, latencyMs: 0 } });
  }
  if (path === '/api/fulltext-recall') {
    let input;
    try { input = readFulltextInput(body); } catch { return unavailable(); }
    if (![UNIVERSITY_PROMPT, SPACE_PROMPT, DIGITAL_PROMPT].includes(input.taskPrompt)) return unavailable();
    const source = fulltextModelInput(input).essays.find(essay => essay.text === SOURCE_ESSAY);
    const paths = input.taskPrompt === UNIVERSITY_PROMPT && source ? [{
      old_point: '线上服务可以提高效率，但只提供线上渠道，会让缺乏数字技能或可靠网络的人难以获得服务；保留人工渠道能减少这种障碍。',
      sources: [{ essay_id: source.essay_id, quote: SOURCE_QUOTE }],
      adaptation_direction: '内容调整：把原文中的公共服务机构换成大学的选课、助学金等学生服务；保留“线上便利并不意味着每个人都能顺利使用”的判断。不要据此推断所有学生都遇到困难。\n句式复用：可沿用原句中“Even when …, … should … for …”的让步结构，自己填写服务场景、保留的渠道和需要帮助的人。',
    }] : [];
    return Response.json({ version: 4, paths: bindFulltextOutput({ paths }, input), meta: { promptVersion: FULLTEXT_PROMPT_VERSION, callCount: input.essays.length ? 1 : 0, model: 'built-in-demo', latencyMs: 0 } });
  }
  return unavailable();
}
