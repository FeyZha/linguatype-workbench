// Synthetic business cases; real endpoint calls, one attempt per case, no provider credentials.
// node scripts/check-recall-demo.mjs [http://127.0.0.1:3002] [--output path] [--validate-only]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRecallDemoWorkspace, RECALL_DEMO_CASES } from '../app/demo-recall.ts';
import { isPersistedWorkspace } from '../app/workspace-state.ts';
import { ARGUMENT_ASSET_RECALL_API_PATH, readArgumentAssetRecallInput, readArgumentAssetRecallResult } from '../app/argument-asset-recall.ts';

let baseUrl = 'http://127.0.0.1:3002', outputPath, validateOnly = false, hasUrl = false;
const args = process.argv.slice(2);
while (args.length) {
  const arg = args.shift();
  if (arg === '--validate-only') validateOnly = true;
  else if (arg === '--output') {
    outputPath = args.shift();
    assert(outputPath && !outputPath.startsWith('--'), '--output needs a file path');
  } else {
    assert(!arg.startsWith('--') && !hasUrl, 'Unexpected argument');
    baseUrl = arg;
    hasUrl = true;
  }
}
const endpoint = new URL(ARGUMENT_ASSET_RECALL_API_PATH, baseUrl);
assert(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password, 'Use an HTTP URL without credentials');

const workspace = createRecallDemoWorkspace();
assert(isPersistedWorkspace(workspace), 'Invalid demo workspace');
assert.deepEqual(RECALL_DEMO_CASES.map(item => item.expectedCount), [1, 0, 0]);
assert.equal(new Set(RECALL_DEMO_CASES.map(item => item.documentId)).size, 3);
assert.equal(workspace.documents.length, 4);
const assets = workspace.argumentAssets;
assert.equal(assets?.length, 1);
assert(assets.every(asset => asset.kind === 'thought' && asset.status === 'active'));
for (const asset of assets) {
  for (const source of asset.sources) {
    const document = workspace.documents.find(item => item.documentId === source.documentId);
    const pack = workspace.topicAssetPacks?.find(item => item.sourceDocumentId === source.documentId
      && (item.completion?.versionId ?? `pack:${item.id}:r${item.revision}`) === source.revisionId);
    assert(document && pack && pack.sourceEssaySnapshot.includes(source.quote), 'Missing frozen source quote');
    assert.equal(document.essay, pack.sourceEssaySnapshot);
    assert.equal(source.taskPrompt, document.taskPrompt);
  }
}
for (const item of RECALL_DEMO_CASES) {
  const document = workspace.documents.find(document => document.documentId === item.documentId);
  assert(document && document.essay === '' && document.taskPrompt === item.taskPrompt, 'Case must start with an empty draft');
  assert(!assets.some(asset => asset.sources.some(source => source.documentId === item.documentId)), 'Case cannot recall itself');
  readArgumentAssetRecallInput({ taskPrompt: item.taskPrompt, currentDraft: '', assets });
}

if (validateOnly) {
  console.log('PASS: 3 cases (expected 1/0/0), 1 active thought, frozen source quotes and empty drafts; no API calls.');
} else {
  const run = { startedAt: new Date().toISOString(), evidence: 'Synthetic cases; live endpoint responses; one attempt per case.', endpoint: endpoint.href, cases: [] };
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
  }
  for (const item of RECALL_DEMO_CASES) {
    const result = { documentId: item.documentId, label: item.label, expectedCount: item.expectedCount,
      input: { taskPrompt: item.taskPrompt, currentDraft: '', assets }, passed: false };
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.input), signal: AbortSignal.timeout(60000) });
      if (!response.ok) result.error = `HTTP_${response.status}`;
      else {
        const parsed = readArgumentAssetRecallResult(await response.json(), assets);
        const { model, promptVersion, callCount, latencyMs } = parsed.meta;
        result.response = { version: 3, matches: parsed.matches, meta: { model, promptVersion, callCount, latencyMs } };
        result.actualCount = parsed.matches.length;
        result.passed = result.actualCount === item.expectedCount && callCount === 1;
      }
    } catch (error) {
      result.error = error?.name === 'TimeoutError' ? 'TIMEOUT'
        : error instanceof SyntaxError || error?.message === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'REQUEST_FAILED';
    }
    run.cases.push(result);
    if (outputPath) await writeFile(outputPath, JSON.stringify(run, null, 2) + '\n');
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${item.label}: expected ${item.expectedCount}, actual ${result.actualCount ?? result.error}`);
  }
  if (run.cases.some(item => !item.passed)) process.exitCode = 1;
}
