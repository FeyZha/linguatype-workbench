import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION as promptVersion } from '../app/argument-asset-recall.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT as systemPrompt, ARGUMENT_ASSET_RECALL_VERIFICATION_PROMPT as verificationPrompt, ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA as verificationSchema } from '../app/server/argument-asset-recall.ts';

test('stage metrics separate ranked candidates, missing candidates, false acceptance, and failed verification', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recall-stage-metrics-'));
  const prototype = fileURLToPath(new URL('../', import.meta.url));
  const workspace = fileURLToPath(new URL('../../evals/argument-asset-loop/runs/learner-themes-25-v1-20260926/workspace.json', import.meta.url));
  const [a, b] = JSON.parse(readFileSync(workspace)).argumentAssets.map(x => x.assetId);
  const log = join(directory, 'server.log'), runId = 'synthetic-stage-metrics';
  const cases = ['ranked', 'omitted', 'wrong', 'failure'].map(id => ({ documentId: id, taskPrompt: id, kind: 'boundary', expected: { requiredAssetIds: id === 'wrong' ? [] : [a], allowedAssetIds: id === 'wrong' ? [] : [a], minCount: id === 'wrong' ? 0 : 1, maxCount: id === 'wrong' ? 0 : 1 } }));
  writeFileSync(log, '');
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw), id = input.taskPrompt;
    assert.deepEqual(Object.keys(input).sort(), ['assets', 'currentDraft', 'taskPrompt']);
    const candidates = id === 'ranked' ? [b, a] : id === 'omitted' ? [] : id === 'wrong' ? [b] : [a, b];
    const status = id === 'failure' ? 502 : 200;
    for (const event of [{ event: 'stage_end', stage: 'candidate', assetIds: candidates }, { event: 'request_end', httpStatus: status, firstAttemptSuccess: status === 200, modelCalls: candidates.length ? 2 : 1, retries: 0 }]) appendFileSync(log, JSON.stringify({ scope: 'argument-asset-recall', requestId: id, runId, ...event }) + '\n');
    res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': id });
    res.end(JSON.stringify(status === 502 ? { version: 2, error: 'RECALL_UNAVAILABLE' } : { version: 3, matches: (id === 'ranked' ? [a] : id === 'wrong' ? [b] : []).map(assetId => ({ assetId })), meta: { model: 'synthetic', promptVersion, callCount: candidates.length ? 2 : 1, latencyMs: 0 } }));
  });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const fixture = join(directory, 'cases.json'), selectorPath = join(directory, 'selector.json'), plan = join(directory, 'plan.json'), outputDir = join(directory, 'output');
    writeFileSync(fixture, JSON.stringify({ evalSetId: 'synthetic-stage-metrics', cases }));
    writeFileSync(selectorPath, JSON.stringify({ promptVersion, systemPrompt, verificationPrompt, verificationSchema }));
    writeFileSync(plan, JSON.stringify({ runId, rounds: 1, workspace, suites: [fixture], selectorPath, outputDir, serverLog: log, endpoint: `http://127.0.0.1:${server.address().port}` }));
    const child = spawn(process.execPath, ['scripts/check-recall-baseline.mjs', plan], { cwd: prototype, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = ''; child.stdout.resume(); child.stderr.on('data', chunk => { errors += chunk; });
    const [code] = await once(child, 'close'); assert.equal(code, 0, errors);
    const summary = JSON.parse(readFileSync(join(outputDir, 'summary.json'))).overall;
    assert.deepEqual(summary.stageMetrics, { requiredAssets: 3, top1: 1, top2: 2, top3Observed: 2, candidateStageUnfinished: 0, trueCandidates: 1, trueAccepted: 1, falseCandidates: 2, falseRejected: 1, verifierUnjudged: 2 });
    assert.equal(summary.runtimeFailures, 1);
    assert.equal(summary.semanticFailures, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
