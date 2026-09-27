import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readWorkspaceBackup } from '../app/workspace-data.ts';
import { analyzeWritingUsage } from '../app/writing-usage.ts';
import { analyzeIdeaUsage } from '../app/idea-usage.ts';
import { readCompletionCandidates } from '../app/writing-completion.ts';
const run = new URL('../../evals/expression-scaffold/runs/mvp-demo-enrichment-20260911/', import.meta.url);
await mkdir(run, { recursive: true });
const workspace = readWorkspaceBackup(await readFile(new URL('../../evals/expression-scaffold/runs/mvp-demo-20260911/workspace.json', import.meta.url), 'utf8'));
const doc = workspace.documents.find(d => d.documentId === 'mvp-finished-city'), completion = doc.completions[0];
let calls = 0;
async function api(path, options) {
  const file = new URL(`${String(++calls).padStart(2, '0')}-${path.split('/').at(-1)}.json`, run), input = JSON.parse(options.body);
  let receipt;
  try { receipt = JSON.parse(await readFile(file, 'utf8')); if (JSON.stringify(input) !== JSON.stringify(receipt.input)) throw new Error('REQUEST_CHANGED'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(new URL(path, 'http://127.0.0.1:4173'), options);
    receipt = { input, output: await response.json(), status: response.status };
    await writeFile(file, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  }
  console.log(file.pathname.split('/').at(-1));
  return Response.json(receipt.output, { status: receipt.status ?? 200 });
}
const signal = AbortSignal.timeout(240000);
for (const [field, assets] of [['usageReviews', completion.writingTrace.initialAssets], ['ideaUsageReviews', workspace.assetLibrary.ideas], ['reasonUsageReviews', workspace.assetLibrary.reasons]]) {
  for (const asset of assets) {
    if (completion[field].some(r => r.asset.assetId === asset.assetId)) continue;
    const result = field === 'usageReviews' ? await analyzeWritingUsage(doc.documentId, completion, asset, signal, api) : await analyzeIdeaUsage(completion, asset, signal, api);
    completion[field].push({ asset, attemptId: `mvp-use-${asset.assetId}`, status: 'ready', correction: 'none', ...result });
  }
}
const response = await api('/api/language-extraction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskPrompt: completion.taskPrompt, completedEssay: completion.essay, helpTargets: [], existingAssets: workspace.assetLibrary.assets.map(({ meaningZh, expression }) => ({ meaningZh, expression })) }), signal });
const result = await response.json();
completion.attemptId = 'mvp-finished-extraction';
if (response.ok) { completion.candidates = readCompletionCandidates(result, completion); completion.status = 'ready'; completion.analysisMeta = result.meta; }
else { completion.status = 'error'; completion.errorKind = 'request_failed'; }
// Independent editorial review corrects the record, never the preserved model response.
completion.usageReviews[0].correction = 'exclude';
completion.usageReviews[0].correctionNote = '演示复核：展示过的中文只谈预算投向，没有交通拥堵的含义；原帮助归因不采纳。';
completion.ideaUsageReviews[0].correction = 'exclude';
const json = JSON.stringify(workspace, null, 2);
readWorkspaceBackup(json);
await writeFile(new URL('../app/mvp-demo.json', import.meta.url), json + '\n');
await writeFile(new URL('workspace.json', run), json + '\n', { flag: 'wx' });
console.log('Ready: all 14 material-use records; extraction status: ' + completion.status);
