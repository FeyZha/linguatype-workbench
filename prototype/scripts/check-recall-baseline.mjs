// One HTTP attempt per case; preserves provider attempts and frozen expectations separately.
// node scripts/check-recall-baseline.mjs <plan.json> [--validate-only]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION, readArgumentAssetRecallInput, readArgumentAssetRecallResult } from '../app/argument-asset-recall.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT, ARGUMENT_ASSET_RECALL_VERIFICATION_PROMPT, ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA } from '../app/server/argument-asset-recall.ts';

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert(/^[a-zA-Z0-9_-]{1,100}$/.test(plan.runId));
assert(Number.isInteger(plan.rounds) && plan.rounds > 0);
const workspace = JSON.parse(readFileSync(plan.workspace, 'utf8'));
const assets = workspace.argumentAssets.filter(asset => asset.kind === 'thought' && asset.status === 'active');
const suites = plan.suites.map(path => ({ path, ...JSON.parse(readFileSync(path, 'utf8')) }));
const cases = suites.flatMap(suite => suite.cases.map(item => ({ ...item, evalSetId: suite.evalSetId, kind: suite.evalSetId.includes('negative-boundary') ? 'hard-negative' : item.kind, formal: item.formal !== false }))).filter(item => !plan.formalOnly || item.formal);
assert.equal(new Set(cases.map(item => item.documentId)).size, cases.length);
for (const item of cases) {
  readArgumentAssetRecallInput({ taskPrompt: item.taskPrompt, currentDraft: item.currentDraft ?? '', assets });
  if (!item.formal) continue;
  const expected = item.expected;
  assert(expected && Array.isArray(expected.requiredAssetIds) && Array.isArray(expected.allowedAssetIds));
  assert(expected.requiredAssetIds.every(id => expected.allowedAssetIds.includes(id)));
  assert(expected.allowedAssetIds.every(id => assets.some(asset => asset.assetId === id)));
  assert(Number.isInteger(expected.minCount) && Number.isInteger(expected.maxCount) && expected.minCount >= 0 && expected.minCount <= expected.maxCount && expected.maxCount <= 3);
}
const runtimeFiles = ['app/server/structured-model.ts', 'app/server/argument-asset-verification.ts', 'app/server/argument-asset-recall.ts', 'app/api/argument-asset-recall/route.ts', 'app/argument-asset-recall.ts', 'app/argument-assets.ts', 'app/page.tsx', 'app/globals.css'];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inputs = [...new Set([plan.workspace, ...plan.suites, ...(plan.freezeFiles ?? []), ...(plan.selectorPath ? [plan.selectorPath] : []), ...runtimeFiles, 'scripts/check-recall-baseline.mjs'])].map(path => ({ path: resolve(path), sha256: hash(path) }));
const verifyLock = () => inputs.forEach(item => assert.equal(hash(item.path), item.sha256, 'Frozen file changed: ' + item.path));
const oldSelector = plan.selectorPath ? JSON.parse(readFileSync(plan.selectorPath, 'utf8')) : JSON.parse(readFileSync('../evals/argument-asset-loop/runs/recall-question-relevance-v9-20260927/recall-results.json', 'utf8')).selector;
assert.equal(ARGUMENT_ASSET_RECALL_PROMPT_VERSION, oldSelector.promptVersion);
assert.equal(ARGUMENT_ASSET_RECALL_PROMPT, oldSelector.systemPrompt);
assert.equal(ARGUMENT_ASSET_RECALL_VERIFICATION_PROMPT, oldSelector.verificationPrompt);
assert.deepEqual(ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA, oldSelector.verificationSchema);
if (process.argv.includes('--validate-only')) {
  console.log(JSON.stringify({ valid: true, cases: cases.length, formal: cases.filter(item => item.formal).length, rounds: plan.rounds, promptUnchanged: true }));
  process.exit(0);
}
mkdirSync(plan.outputDir, { recursive: true });
const save = (name, data) => writeFileSync(resolve(plan.outputDir, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
save('manifest.json', { startedAt: new Date().toISOString(), plan, inputs, selector: oldSelector, assets: readArgumentAssetRecallInput({ taskPrompt: cases[0].taskPrompt, currentDraft: '', assets }).assets, notice: 'Synthetic cases; fixed prompt and code throughout; no HTTP/client retries. Existing provider format retries remain observable. No production essay text is logged.' });
writeFileSync(resolve(plan.outputDir, 'cases.jsonl'), '', { flag: 'wx' });
function eventsFor(requestId) {
  const events = [];
  for (const line of readFileSync(plan.serverLog, 'utf8').split('\n')) {
    const start = line.indexOf('{"scope":"argument-asset-recall"');
    if (start < 0) continue;
    try { const event = JSON.parse(line.slice(start).trim()); if (event.runId === plan.runId && event.requestId === requestId) events.push(event); } catch { /* Non-JSON dev-server output is not telemetry. */ }
  }
  return events;
}
const records = [];
for (let round = 1; round <= plan.rounds; round++) {
  for (const item of cases) {
    verifyLock();
    const startedAt = new Date().toISOString(), start = performance.now();
    const record = { round, ...item, startedAt, httpStatus: null, requestId: null, response: null, error: null, semanticPass: null, events: [] };
    try {
      // Deliberate allowlist: frozen expected/reviewer notes never enter the request.
      const response = await fetch(plan.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-recall-run-id': plan.runId }, body: JSON.stringify({ taskPrompt: item.taskPrompt, currentDraft: item.currentDraft ?? '', assets }), signal: AbortSignal.timeout(510000), redirect: 'error' });
      record.httpStatus = response.status;
      record.requestId = response.headers.get('x-request-id');
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { record.error = 'http_body_parse'; }
      if (!response.ok) record.error = 'http_' + response.status;
      record.bodyEvidence = { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), json: body !== undefined, routeError: ['INVALID_INPUT', 'RECALL_UNAVAILABLE'].includes(body?.error) ? body.error : null };
      if (response.ok && body) {
        record.response = readArgumentAssetRecallResult(body, assets);
        const ids = record.response.matches.map(match => match.assetId);
        if (item.formal) record.semanticPass = item.expected.requiredAssetIds.every(id => ids.includes(id)) && ids.every(id => item.expected.allowedAssetIds.includes(id)) && ids.length >= item.expected.minCount && ids.length <= item.expected.maxCount;
      }
    } catch (error) { record.error = error?.name === 'TimeoutError' ? 'client_timeout' : error?.message === 'INVALID_RESPONSE' ? 'response_schema' : 'client_network_or_runtime'; }
    record.latencyMs = Math.round(performance.now() - start);
    await setTimeout(25);
    record.events = record.requestId ? eventsFor(record.requestId) : [];
    const end = record.events.findLast(event => event.event === 'request_end');
    record.telemetryComplete = Boolean(end);
    record.firstAttemptSuccess = Boolean(record.response && end?.firstAttemptSuccess);
    record.eventualSuccess = Boolean(record.response);
    record.modelCalls = end?.modelCalls ?? null;
    record.retries = end?.retries ?? null;
    record.failureLayer = record.eventualSuccess ? null : end?.failedStage ?? 'unattributed_client_dev_or_proxy';
    record.errorType = end?.errorType ?? record.error;
    record.candidateCount = record.events.find(event => event.event === 'stage_end' && event.stage === 'candidate' && !event.errorType)?.assetIds?.length ?? null;
    record.verifierTargets = record.events.find(event => event.event === 'stage_start' && event.stage === 'verification')?.targetAssetIds ?? [];
    record.verifierCalls = record.events.filter(event => event.event === 'provider_start' && event.stage === 'verification').length;
    records.push(record);
    appendFileSync(resolve(plan.outputDir, 'cases.jsonl'), JSON.stringify(record) + '\n');
    console.log(`${round}/${plan.rounds} ${item.documentId} http=${record.httpStatus} semantic=${record.semanticPass} calls=${record.modelCalls} retries=${record.retries} ms=${record.latencyMs}`);
  }
}
verifyLock();
const stats = rows => {
  const times = rows.map(row => row.latencyMs).sort((a, b) => a - b);
  const formal = rows.filter(row => row.formal), completed = formal.filter(row => row.eventualSuccess);
  const sum = key => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const stageMetrics = { requiredAssets: 0, top1: 0, top2: 0, top3Observed: 0, candidateStageUnfinished: 0, trueCandidates: 0, trueAccepted: 0, falseCandidates: 0, falseRejected: 0, verifierUnjudged: 0 };
  for (const row of formal) {
    const candidateEnd = row.events.find(event => event.event === 'stage_end' && event.stage === 'candidate' && !event.errorType);
    const ids = candidateEnd?.assetIds ?? [], accepted = row.response?.matches.map(match => match.assetId) ?? [];
    if (!candidateEnd) stageMetrics.candidateStageUnfinished++;
    for (const id of row.expected.requiredAssetIds) {
      stageMetrics.requiredAssets++;
      const position = ids.indexOf(id) + 1;
      for (const [key, k] of [['top1', 1], ['top2', 2], ['top3Observed', 3]]) if (position > 0 && position <= k) stageMetrics[key]++;
    }
    for (const id of ids) {
      if (!row.response) { stageMetrics.verifierUnjudged++; continue; }
      if (row.expected.requiredAssetIds.includes(id)) { stageMetrics.trueCandidates++; if (accepted.includes(id)) stageMetrics.trueAccepted++; }
      else if (!row.expected.allowedAssetIds.includes(id)) { stageMetrics.falseCandidates++; if (!accepted.includes(id)) stageMetrics.falseRejected++; }
    }
  }
  return { stageMetrics, cases: rows.length, formal: formal.length, exploratory: rows.length - formal.length, firstAttemptSuccesses: rows.filter(row => row.firstAttemptSuccess).length, eventualSuccesses: rows.filter(row => row.eventualSuccess).length, telemetryMissing: rows.filter(row => !row.telemetryComplete).length, runtimeFailures: rows.filter(row => !row.eventualSuccess).length, semanticPasses: completed.filter(row => row.semanticPass).length, semanticFailures: completed.filter(row => !row.semanticPass).length, modelCalls: sum('modelCalls'), retries: sum('retries'), retryAssistedSuccesses: rows.filter(row => row.eventualSuccess && row.retries > 0).length, latencyMs: { median: times.length % 2 ? times[Math.floor(times.length / 2)] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2, p90: times[Math.ceil(times.length * .9) - 1], max: times.at(-1) }, averageCandidateCount: sum('candidateCount') / rows.length, averageVerifierTargets: rows.reduce((n, row) => n + row.verifierTargets.length, 0) / rows.length, averageVerifierCalls: sum('verifierCalls') / rows.length, averageModelCalls: sum('modelCalls') / rows.length };
};
const summary = { finishedAt: new Date().toISOString(), overall: stats(records), byRound: Array.from({ length: plan.rounds }, (_, i) => ({ round: i + 1, ...stats(records.filter(row => row.round === i + 1)), byKind: Object.fromEntries([...new Set(cases.map(item => item.kind))].map(kind => [kind, stats(records.filter(row => row.round === i + 1 && row.kind === kind))])) })), byKind: Object.fromEntries([...new Set(cases.map(item => item.kind))].map(kind => [kind, stats(records.filter(row => row.kind === kind))])), emptyExpected: stats(records.filter(row => row.formal && row.expected.maxCount === 0)), nonemptyRequired: stats(records.filter(row => row.formal && row.expected.minCount > 0)) };
save('summary.json', summary);
console.log(JSON.stringify(summary.overall));
