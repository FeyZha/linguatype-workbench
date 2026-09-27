// Synthetic learner decisions; live extraction uses the unchanged local product API.
// extract <essays.json> <new-run-directory> [base-url] [--validate-only]
// assemble <run-directory> <decisions.json> [--validate-only]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createCompletedVersion } from '../app/article-completion.ts';
import { createEssayDocument, isPersistedWorkspace } from '../app/workspace-state.ts';
import { readWorkspaceBackup } from '../app/workspace-data.ts';
import { DEPOSIT_API_PATH, DEPOSIT_PROMPT_VERSION, THOUGHT_SCHEMA_VERSION, readTopicAssetCandidate, saveTopicAssetPack, topicAssetItemCount, topicLanguageExpressions } from '../app/topic-assets.ts';
import { applyArgumentAssetDecision, attachAssetToPackExpressions } from '../app/argument-assets.ts';
import { expressionKey } from '../app/transferable-expression.ts';
import { readDepositInput } from '../app/server/topic-deposit.ts';

const evidence = 'Synthetic learner essays and role-play confirmations, not real user behaviour or verified IELTS scores. One live product API request per essay, no script retries or invented assets. The unchanged server may retry a model call internally; successful response meta.callCount records that count, failed calls may be unobservable.';
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha256 = raw => createHash('sha256').update(raw).digest('hex');
const now = () => new Date().toISOString();
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeNew = (path, value) => writeFile(path, json(value), { flag: 'wx' });
const text = (value, max, required = true) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());

function validateSource(source) {
  assert(source.synthetic === true && text(source.evalSetId, 200) && text(source.notice, 4000) && source.learnerProfile, 'Source must explicitly identify synthetic evidence');
  assert(Array.isArray(source.themes) && source.themes.length === 5, 'Expected five themes');
  const themes = new Set(source.themes.map(theme => theme.id));
  assert(themes.size === 5 && source.themes.every(theme => text(theme.id, 100) && text(theme.titleZh, 200)), 'Invalid themes');
  assert(Array.isArray(source.essays) && source.essays.length === 25, 'Expected 25 essays');
  for (const field of ['id', 'taskPrompt', 'finalEssay']) assert.equal(new Set(source.essays.map(essay => essay[field])).size, 25, `Duplicate ${field}`);
  for (const essay of source.essays) {
    assert(text(essay.id, 120) && /^[a-zA-Z0-9_-]+$/.test(essay.id), 'Essay ID must be safe as a file name');
    assert(themes.has(essay.theme) && text(essay.titleZh, 300) && text(essay.taskType, 100) && text(essay.saveReasonZh, 260, false), `Invalid essay metadata: ${essay.id}`);
    assert(text(essay.finalEssay, 20000) && essay.finalEssay === essay.finalEssay.trim(), `Invalid essay: ${essay.id}`);
    const count = essay.finalEssay.split(/\s+/).length;
    assert(count >= 250 && count <= 290 && essay.wordCount === count, `${essay.id}: expected 250–290 words and exact wordCount; got ${count}`);
    readDepositInput({ documentId: essay.id, taskPrompt: essay.taskPrompt, snapshot: essay.finalEssay, existingExpressions: [] });
  }
  for (const theme of themes) assert.equal(source.essays.filter(essay => essay.theme === theme).length, 5, `${theme}: expected five essays`);
}

async function completionFor(essay, at) {
  return createCompletedVersion({ documentId: essay.id, sourceTitle: `合成考生 · ${essay.titleZh}`, taskPrompt: essay.taskPrompt, snapshot: essay.finalEssay }, `${essay.id}-synthetic-completion`, at, essay.saveReasonZh ? `合成角色确认：${essay.saveReasonZh}` : '');
}

function readResponse(value, input) {
  assert(value?.version === 1 && value.documentId === input.documentId && value.meta, 'INVALID_RESPONSE');
  assert(text(value.meta.model, 200) && value.meta.promptVersion === DEPOSIT_PROMPT_VERSION && [1, 2].includes(value.meta.callCount) && Number.isFinite(value.meta.latencyMs) && value.meta.latencyMs >= 0, 'INVALID_RESPONSE');
  const candidate = readTopicAssetCandidate(value.candidate, input.snapshot);
  assert.equal(candidate.schemaVersion, THOUGHT_SCHEMA_VERSION, 'Unexpected legacy candidate');
  const existing = new Set(input.existingExpressions.map(expressionKey));
  assert(!topicLanguageExpressions(candidate).some(item => existing.has(expressionKey(item.expression))), 'DUPLICATE_EXPRESSION');
  return candidate;
}

// Store only endpoint protocol fields, never transport headers or provider credentials.
function protocolResponse(value) {
  if (!value || typeof value !== 'object') return null;
  const meta = value.meta && typeof value.meta === 'object'
    ? Object.fromEntries(['model', 'promptVersion', 'callCount', 'latencyMs'].filter(key => ['string', 'number'].includes(typeof value.meta[key])).map(key => [key, value.meta[key]])) : undefined;
  return { ...(typeof value.version === 'number' ? { version: value.version } : {}), ...(text(value.documentId, 200) ? { documentId: value.documentId } : {}), ...(value.candidate && typeof value.candidate === 'object' ? { candidate: value.candidate } : {}), ...(meta ? { meta } : {}), ...(['INVALID_INPUT', 'DEPOSIT_UNAVAILABLE'].includes(value.error) ? { error: value.error } : {}) };
}

async function extract(sourcePath, runPath, baseUrl, validateOnly) {
  const raw = await readFile(sourcePath, 'utf8'), source = JSON.parse(raw);
  validateSource(source);
  const endpoint = new URL(DEPOSIT_API_PATH, baseUrl);
  assert(['http:', 'https:'].includes(endpoint.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) && !endpoint.username && !endpoint.password, 'Use a local HTTP product server without URL credentials');
  const startedAt = now();
  const completions = await Promise.all(source.essays.map(essay => completionFor(essay, startedAt)));
  if (validateOnly) {
    console.log('PASS: five themes, 25 unique essays, word counts, product inputs and synthetic completion confirmations; no API calls or writes.');
    return;
  }
  await mkdir(dirname(runPath), { recursive: true });
  await mkdir(runPath); // An existing run is immutable: use a fresh directory.
  await writeFile(join(runPath, 'essays.json'), raw, { flag: 'wx' });
  await writeNew(join(runPath, 'manifest.json'), { evalSetId: source.evalSetId, synthetic: true, evidence, startedAt, sourceSha256: sha256(raw), promptVersion: DEPOSIT_PROMPT_VERSION, endpoint: endpoint.href, maxApiAttempts: 25 });
  const run = { evalSetId: source.evalSetId, synthetic: true, evidence, startedAt, records: [] };
  await writeNew(join(runPath, 'extraction.json'), run);
  const expressions = [];
  for (const [index, essay] of source.essays.entries()) {
    const completion = completions[index];
    const input = readDepositInput({ documentId: essay.id, taskPrompt: completion.taskPrompt, snapshot: completion.snapshot, existingExpressions: [...expressions] });
    const record = { documentId: essay.id, theme: essay.theme, synthetic: true, confirmationKind: 'synthetic-role-play', input, completion, status: 'loading', startedAt: now(), attemptCount: 1 };
    const documentDirectory = join(runPath, essay.id);
    await mkdir(documentDirectory);
    completion.status = 'loading';
    completion.requestId = `${essay.id}-attempt-1`;
    await writeNew(join(documentDirectory, 'completion.json'), completion);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(250000) });
      record.httpStatus = response.status;
      const value = await response.json();
      record.response = protocolResponse(value);
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      completion.candidate = readResponse(value, input);
      completion.meta = { model: value.meta.model, promptVersion: value.meta.promptVersion };
      completion.status = 'ready';
      record.status = 'ready';
      expressions.push(...topicLanguageExpressions(completion.candidate).map(item => item.expression));
    } catch (error) {
      record.status = 'error';
      record.error = error?.name === 'TimeoutError' ? 'TIMEOUT' : record.httpStatus && record.httpStatus >= 400 ? `HTTP_${record.httpStatus}` : record.httpStatus ? 'INVALID_RESPONSE' : 'REQUEST_FAILED';
      completion.status = 'error';
      completion.error = `合成体验提炼失败：${record.error}。本次未重试，完成正文保留。`;
    }
    record.finishedAt = now();
    await writeNew(join(documentDirectory, 'extraction.json'), record);
    run.records.push(record);
    await writeFile(join(runPath, 'extraction.json'), json(run));
    console.log(`${index + 1}/25 ${essay.id}: ${record.status}${completion.candidate ? `; thoughts=${Number(!!completion.candidate.thought)}, expressions=${topicLanguageExpressions(completion.candidate).length}` : `; ${record.error}`}`);
  }
  run.finishedAt = now();
  run.apiAttempts = run.records.length;
  run.observedModelCalls = run.records.reduce((sum, record) => sum + (record.response?.meta?.callCount ?? 0), 0);
  run.failedApiAttempts = run.records.filter(record => record.status === 'error').length;
  await writeFile(join(runPath, 'extraction.json'), json(run));
  console.log(`Recorded ${run.records.length} attempts; ${run.records.filter(record => record.status === 'error').length} failures preserved.`);
}

async function assemble(runPath, decisionsPath, validateOnly) {
  const raw = await readFile(join(runPath, 'essays.json'), 'utf8'), source = JSON.parse(raw);
  const manifest = await readJson(join(runPath, 'manifest.json')), run = await readJson(join(runPath, 'extraction.json'));
  validateSource(source);
  assert.equal(sha256(raw), manifest.sourceSha256, 'Frozen essays changed');
  assert(source.evalSetId === manifest.evalSetId && source.evalSetId === run.evalSetId, 'Run refers to a different evaluation set');
  assert(manifest.synthetic === true && run.synthetic === true && run.finishedAt && run.records.length === 25, 'Run must contain 25 finished attempts');
  assert.equal(manifest.promptVersion, DEPOSIT_PROMPT_VERSION, 'Use the extraction prompt version recorded for this runner');
  assert.equal(new Set(run.records.map(record => record.documentId)).size, 25, 'Duplicate extraction records');
  const decisions = await readJson(decisionsPath);
  assert(decisions.synthetic === true && Array.isArray(decisions.decisions), 'Decisions must be explicitly synthetic');
  const byId = new Map(decisions.decisions.map(decision => [decision.documentId, decision]));
  assert.equal(byId.size, decisions.decisions.length, 'Duplicate decisions');
  assert(decisions.decisions.every(decision => source.essays.some(essay => essay.id === decision.documentId) && ['new', 'skip'].includes(decision.action) && text(decision.reasonZh, 2000)), 'Invalid decision');
  const savedAt = now();
  const workspace = { version: 2, documents: [], activeDocumentId: source.essays[0].id, savedAt, topicAssetPacks: [], argumentAssets: [], argumentAssetUsages: [], expressionMemories: [], starterMaterialsLoaded: true };
  for (const essay of source.essays) {
    const record = run.records.find(record => record.documentId === essay.id);
    assert(record?.synthetic === true && record.attemptCount === 1 && ['ready', 'error'].includes(record.status), `Unfinished attempt: ${essay.id}`);
    assert.deepEqual(record, await readJson(join(runPath, essay.id, 'extraction.json')), 'Summary and independent extraction record differ');
    readDepositInput(record.input);
    assert(record.input.documentId === essay.id && record.input.snapshot === essay.finalEssay && record.input.taskPrompt === essay.taskPrompt, 'Endpoint input differs from frozen essay');
    const version = structuredClone(record.completion);
    assert(version.documentId === essay.id && version.snapshot === essay.finalEssay && version.taskPrompt === essay.taskPrompt && version.essayHash === sha256(essay.finalEssay), 'Completion differs from frozen essay');
    const document = createEssayDocument(essay.id, version.confirmedAt, { taskPrompt: essay.taskPrompt, essay: essay.finalEssay, promptSource: { kind: 'custom' } });
    document.completedVersions = [version];
    workspace.documents.push(document);
    if (record.status === 'error') {
      assert.equal(version.status, 'error');
      assert(!byId.has(essay.id) || byId.get(essay.id).action === 'skip', 'A failed extraction cannot be saved');
      continue;
    }
    assert.deepEqual(readResponse(record.response, record.input), version.candidate, 'Candidate differs from endpoint response');
    assert.deepEqual(version.meta, { model: record.response.meta.model, promptVersion: record.response.meta.promptVersion }, 'Completion metadata differs from endpoint response');
    assert.equal(version.status, 'ready');
    if (!topicAssetItemCount(version.candidate)) {
      assert(!byId.has(essay.id) || byId.get(essay.id).action === 'skip', 'An empty extraction cannot be saved');
      version.status = 'empty';
      continue;
    }
    const reviewed = byId.get(essay.id);
    assert(reviewed, `Missing synthetic learner decision: ${essay.id}`);
    assert(version.candidate.thought || reviewed.action === 'skip', 'Cannot create a ThoughtAsset from expressions alone');
    const decision = { action: reviewed.action };
    version.argumentDecision = decision;
    const saved = await saveTopicAssetPack(workspace.topicAssetPacks, { documentId: essay.id, sourceTitle: version.sourceTitle, taskPrompt: version.taskPrompt, essay: version.snapshot, completion: { versionId: version.id, confirmedAt: version.confirmedAt, saveReason: version.saveReason } }, version.candidate, version.meta, `${essay.id}-pack`, savedAt);
    const applied = applyArgumentAssetDecision(workspace.argumentAssets, saved.pack, decision, `${essay.id}-thought`, savedAt);
    const linked = attachAssetToPackExpressions(saved.pack, applied.asset);
    workspace.topicAssetPacks = saved.packs.map(pack => pack.id === linked.id ? linked : pack);
    workspace.argumentAssets = applied.assets;
    version.status = 'saved';
    version.assetPackId = linked.id;
    version.assetRevision = linked.revision;
  }
  assert(isPersistedWorkspace(workspace), 'Invalid assembled workspace');
  readWorkspaceBackup(json(workspace));
  assert(workspace.argumentAssets.every(asset => asset.kind === 'thought' && asset.usageCount === 0) && !workspace.argumentAssetUsages.length && !workspace.expressionMemories.length, 'Do not invent usage or revealed expression memories');
  if (!validateOnly) {
    if (resolve(decisionsPath) !== join(runPath, 'decisions.json')) await writeNew(join(runPath, 'decisions.json'), decisions);
    await writeNew(join(runPath, 'workspace.json'), workspace);
  }
  console.log(`PASS: ${workspace.documents.length} frozen essays, ${workspace.topicAssetPacks.length} saved packs, ${workspace.argumentAssets.length} active thoughts; usage and expression memories remain zero${validateOnly ? '; no writes' : ''}.`);
}

const validateOnly = process.argv.includes('--validate-only');
const [stage, first, second, baseUrl = 'http://127.0.0.1:3002', ...extra] = process.argv.slice(2).filter(arg => arg !== '--validate-only');
assert(['extract', 'assemble'].includes(stage) && first && second && !extra.length, 'Usage: extract <essays.json> <new-run-directory> [base-url] | assemble <run-directory> <decisions.json> [--validate-only]');
if (stage === 'extract') await extract(resolve(first), resolve(second), baseUrl, validateOnly);
else await assemble(resolve(first), resolve(second), validateOnly);
