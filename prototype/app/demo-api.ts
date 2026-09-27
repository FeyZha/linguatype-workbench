import { createPrototypeResult, DEMO_DOCUMENTS } from './prototype-cases.ts';
import { createDemoTopicAssets, DEMO_EMPTY_DEPOSIT_CASE } from './demo-topic-assets.ts';
import { RECALL_DEMO_CASES } from './demo-recall.ts';
import { SCAFFOLD_API_VERSION } from './scaffold-api-contract.ts';
import { FEEDBACK_PROMPT_VERSION } from './essay-feedback.ts';
import { DEPOSIT_PROMPT_VERSION } from './topic-assets.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from './argument-asset-recall.ts';
import recorded from './demo-recorded.json' with { type: 'json' };

const packs = createDemoTopicAssets();
const meta = (promptVersion: string) => ({model:'recorded-demo',promptVersion,callCount:1,latencyMs:0});
const failure = () => Response.json({error:'此输入没有预制结果，请使用演示场景。'}, {status:422});
export async function demoFetch(path: string, options: RequestInit = {}) {
  if (options.signal?.aborted) throw new DOMException('Aborted','AbortError');
  const body = JSON.parse(String(options.body || '{}'));
  if (path === '/api/scaffold') {
    const result = createPrototypeResult(body.targetSentence);
    return result ? Response.json(result,{headers:{'x-linguatype-api-version':SCAFFOLD_API_VERSION}}) : failure();
  }
  if (path === '/api/feedback') {
    const saved = recorded.feedback;
    if (body.essay !== saved.essaySnapshot) return failure();
    return Response.json({summary:saved.summary,suggestions:saved.suggestions,meta:meta(FEEDBACK_PROMPT_VERSION)});
  }
  if (path === '/api/deposit') {
    const saved = recorded.completion;
    const pack = packs.find(p => p.sourcePrompt === body.taskPrompt && p.sourceEssaySnapshot === body.snapshot);
    const empty = DEMO_DOCUMENTS.find(d => d.documentId === DEMO_EMPTY_DEPOSIT_CASE.documentId);
    let candidate;
    if (body.snapshot === saved.snapshot && body.taskPrompt === saved.taskPrompt) candidate = saved.candidate;
    else if (pack) candidate = {topicTags:[],viewpoint:null,reasons:[],exampleIdea:null,schemaVersion:3,thought:pack.thought,languageExpressions:[]};
    else if (empty?.essay === body.snapshot && empty.taskPrompt === body.taskPrompt) candidate = DEMO_EMPTY_DEPOSIT_CASE.candidate;
    else return failure();
    return Response.json({version:1,documentId:body.documentId,candidate,meta:meta(DEPOSIT_PROMPT_VERSION)});
  }
  if (path === '/api/argument-asset-recall') {
    const known = RECALL_DEMO_CASES.find(c => c.taskPrompt === body.taskPrompt);
    const university = DEMO_DOCUMENTS.find(d => d.documentId === 'demo-university-digital-access');
    if (!known && body.taskPrompt !== university?.taskPrompt) return failure();
    const positive = known ? known.expectedCount === 1 : true;
    const asset = positive && body.assets.find((a: {sources?: {taskPrompt:string}[]}) => a.sources?.some(s => s.taskPrompt === recorded.completion.taskPrompt));
    return Response.json({version:3,matches:asset ? [{assetId:asset.assetId}] : [],meta:{...meta(ARGUMENT_ASSET_RECALL_PROMPT_VERSION),callCount:0}});
  }
  return failure();
}
