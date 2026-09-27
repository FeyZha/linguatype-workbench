import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { POST } from '../app/api/argument-asset-recall/route.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from '../app/argument-asset-recall.ts';

const workspacePath = fileURLToPath(new URL('../../evals/argument-asset-loop/runs/learner-themes-25-v1-20260926/workspace.json', import.meta.url));
const workspace = JSON.parse(readFileSync(workspacePath, 'utf8'));
const assets = workspace.argumentAssets;
const input = { taskPrompt: 'Synthetic question', currentDraft: 'Synthetic draft', assets };
const request = body => new Request('http://test.invalid/api/argument-asset-recall', { method: 'POST', body: JSON.stringify(body) });

test('actual recall HTTP path exposes only problem context and thought metadata to the model, and rejects invented IDs', async () => {
  const keys = ['base_url', 'api_key', 'model', 'provider'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch, calls = [];
  const originalAssets = structuredClone(assets);
  let matches = [{ assetId: assets[0].assetId }];
  let verifiedMatches, verifierFails = false, verificationPatch = {};
  const malformedStages = new Set();
  Object.assign(process.env, { base_url: 'https://test.invalid', api_key: 'synthetic-test-key', model: 'synthetic-model', provider: 'deepseek' });
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const verifying = body.tool_choice.function.name === 'verify_thought_relevance';
    if (verifying && verifierFails) return new Response(null, { status: 503 });
    if (malformedStages.delete(body.tool_choice.function.name)) return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: body.tool_choice.function.name, arguments: '{' } }] } }] });
    const output = verifying ? { checks: (verifiedMatches?.length === 0 ? matches : verifiedMatches ?? matches).map(match => ({ ...match, relevant: verifiedMatches?.length !== 0, ...verificationPatch })) } : { matches };
    return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: body.tool_choice.function.name, arguments: JSON.stringify(output) } }] } }] });
  };
  try {
    const enrichedAssets = assets.map(asset => ({ ...asset, expected: 'DO_NOT_SEND_EXPECTED', explanation: 'DO_NOT_SEND_EXPLANATION', requiredAssetIds: ['DO_NOT_SEND_REQUIRED'], allowedAssetIds: ['DO_NOT_SEND_ALLOWED'] }));
    const success = await POST(request({ ...input, assets: enrichedAssets }));
    assert.equal(success.status, 200);
    const data = await success.json();
    assert.equal(data.version, 3);
    assert.deepEqual(Object.keys(data).sort(), ['matches', 'meta', 'version'], 'Internal verification notes stay server-side');
    assert.deepEqual(data.matches, matches);
    assert.equal(data.meta.promptVersion, ARGUMENT_ASSET_RECALL_PROMPT_VERSION);
    assert.equal(calls.length, 2);
    assert.equal(data.meta.callCount, 2);
    const modelInput = JSON.parse(calls[0].messages[1].content);
    assert.deepEqual(Object.keys(modelInput).sort(), ['assets', 'currentDraft', 'taskPrompt']);
    assert.equal(modelInput.currentDraft, input.currentDraft);
    assert.equal(modelInput.taskPrompt, input.taskPrompt);
    assert.equal(modelInput.assets.length, 7);
    for (const asset of modelInput.assets) {
      assert.deepEqual(Object.keys(asset).sort(), ['assetId', 'limits', 'rationale', 'thought', 'useWhen']);
      const original = assets.find(item => item.assetId === asset.assetId);
      for (const field of ['thought', 'useWhen', 'rationale', 'limits']) assert.deepEqual(asset[field], original[field]);
    }
    assert(!calls[0].messages[1].content.includes('DO_NOT_SEND_'));
    const verificationInput = JSON.parse(calls[1].messages[1].content);
    assert.deepEqual(verificationInput, { ...modelInput, assets: modelInput.assets.filter(asset => asset.assetId === matches[0].assetId) });
    assert(!calls[1].messages[1].content.includes('DO_NOT_SEND_'));
    for (const field of ['expected', 'explanation', 'requiredAssetIds', 'allowedAssetIds']) {
      const before = calls.length;
      assert.equal((await POST(request({ ...input, [field]: 'DO_NOT_SEND' }))).status, 400);
      assert.equal(calls.length, before);
    }
    verifiedMatches = [];
    const rejected = await (await POST(request(input))).json();
    assert.deepEqual(rejected.matches, []);
    assert.equal(rejected.meta.callCount, 2);
    verifiedMatches = [{ assetId: assets[1].assetId }];
    assert.equal((await POST(request(input))).status, 502, 'Verifier may not add an unselected asset, even if it exists');
    verifiedMatches = undefined;
    verificationPatch = { relevant: false };
    assert.deepEqual((await (await POST(request(input))).json()).matches, []);
    verificationPatch = { relevant: 'true' };
    assert.equal((await POST(request(input))).status, 502);
    verificationPatch = {};
    malformedStages.add('return_related_thought_ids');
    malformedStages.add('verify_thought_relevance');
    const retried = await (await POST(request(input))).json();
    assert.deepEqual(retried.matches, matches);
    assert.equal(retried.meta.callCount, 4, 'Both stages count their actual model attempts');
    verifierFails = true;
    assert.equal((await POST(request(input))).status, 502, 'A failed verification must not expose unverified candidates');
    verifierFails = false;
    matches = [];
    const beforeNoCandidates = calls.length;
    assert.deepEqual((await (await POST(request(input))).json()).matches, []);
    assert.equal(calls.length - beforeNoCandidates, 1, 'No candidates means no verification call');
    const beforeEmpty = calls.length;
    const empty = await (await POST(request({ ...input, assets: [] }))).json();
    assert.deepEqual(empty.matches, []);
    assert.equal(empty.meta.callCount, 0);
    assert.equal(calls.length, beforeEmpty);
    for (const invalid of [[{ assetId: 'invented' }], [{ assetId: assets[0].assetId, explanation: 'generated argument' }], [{ assetId: assets[0].assetId }, { assetId: assets[0].assetId }], assets.slice(0, 4).map(asset => ({ assetId: asset.assetId }))]) {
      matches = invalid;
      const response = await POST(request(input));
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'RECALL_UNAVAILABLE');
    }
    assert.deepEqual(assets, originalAssets);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
  }
});

test('both frozen evaluation suites send no expectations or explanations through the real runner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'linguatype-recall-payload-'));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version: 3, matches: [], meta: { model: 'synthetic-contract-test', promptVersion: ARGUMENT_ASSET_RECALL_PROMPT_VERSION, callCount: 1, latencyMs: 0 } }));
  });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    for (const suite of ['learner-themes-recall.v1', 'learner-themes-negative-boundary.v1']) {
      const casesPath = fileURLToPath(new URL(`../../evals/argument-asset-loop/eval-sets/${suite}/cases.json`, import.meta.url));
      const cases = JSON.parse(readFileSync(casesPath, 'utf8')).cases;
      const start = requests.length;
      const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/check-learner-recall.mjs', import.meta.url)), workspacePath, casesPath, join(directory, `${suite}.json`), `http://127.0.0.1:${server.address().port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.resume(); child.stderr.resume();
      const [code] = await once(child, 'close');
      assert.equal(code, suite === 'learner-themes-recall.v1' ? 1 : 0, 'Mock empty responses deliberately fail the positive suite');
      assert.equal(requests.length - start, cases.length);
      for (const [index, item] of cases.entries()) assert.deepEqual(requests[start + index], { taskPrompt: item.taskPrompt, currentDraft: '', assets });
      const recorded = JSON.parse(readFileSync(join(directory, `${suite}.json`), 'utf8'));
      assert.deepEqual(recorded.cases.map(item => item.expected), cases.map(item => item.expected));
      assert.equal(recorded.selector.promptVersion, ARGUMENT_ASSET_RECALL_PROMPT_VERSION);
    }
    assert.equal(requests.length, 19);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
