import assert from 'node:assert/strict';
import test from 'node:test';
import { demoFetch } from '../demo/api.ts';
import { createPublicWorkspace, DIGITAL_PROMPT, UNIVERSITY_PROMPT, SPACE_PROMPT, SOURCE_ESSAY, REVIEW_ESSAY } from '../demo/workspace.ts';
import { confirmedEssayLibrary, readFulltextResult } from '../app/fulltext-recall.ts';
import { readFeedbackResult, textHash } from '../app/essay-feedback.ts';
import { findMixedSentences } from '../app/sentence-tracking.ts';
import { readScaffoldResponse } from '../app/scaffold-response.ts';
import { SCAFFOLD_API_VERSION } from '../app/scaffold-api-contract.ts';
import { isPersistedWorkspace } from '../app/workspace-state.ts';
import { workspaceStorageKey, isResearchDemoMode, isDemoMode } from '../app/workspace-mode.ts';

const post = body => ({ method: 'POST', body: JSON.stringify(body) });
test('synthetic workspace is reloadable and confirmed source hash matches its full text', async () => {
  const state = await createPublicWorkspace();
  assert.equal(isPersistedWorkspace(state), true);
  assert.equal(state.documents.length, 5);
  const source = state.documents.find(d => d.documentId === 'public-source');
  assert.equal(source.completedVersions[0].essayHash, await textHash(source.essay));
  assert.equal(isPersistedWorkspace(JSON.parse(JSON.stringify(state))), true);
});
test('every preloaded Chinese target has a valid locally revealable response', async () => {
  const state = await createPublicWorkspace();
  const doc = state.documents.find(d => d.documentId === 'public-expression');
  const sentences = findMixedSentences(doc.essay);
  assert.equal(sentences.length, 3);
  for (const sentence of sentences) {
    const parsed = await readScaffoldResponse(await demoFetch('/api/scaffold', post({ taskPrompt: doc.taskPrompt, fullEssay: doc.essay, targetSentence: sentence.text })), SCAFFOLD_API_VERSION);
    assert.equal(parsed.ok, true);
    assert(parsed.result.items.length);
  }
});
test('preloaded review is quoted from the exact draft and revised preset has no forced edits', async () => {
  for (const essay of [REVIEW_ESSAY, SOURCE_ESSAY]) {
    const response = await demoFetch('/api/feedback', post({ taskPrompt: DIGITAL_PROMPT, essay }));
    const result = readFeedbackResult(await response.json(), essay);
    assert.equal(result.suggestions.length, essay === REVIEW_ESSAY ? 2 : 0);
  }
});
test('free edits and mismatched prompts never masquerade as a fresh review', async () => {
  for (const body of [{ taskPrompt: DIGITAL_PROMPT, essay: REVIEW_ESSAY + ' An edit.' }, { taskPrompt: 'A different prompt', essay: REVIEW_ESSAY }]) {
    assert.equal((await demoFetch('/api/feedback', post(body))).status, 422);
  }
});
test('reuse binds the quoted source to independently confirmed text, not the editable draft', async () => {
  const state = await createPublicWorkspace();
  state.documents.find(d => d.documentId === 'public-source').essay = 'An unconfirmed replacement draft.';
  const input = { version: 4, currentDocumentId: 'public-university', taskPrompt: UNIVERSITY_PROMPT, essays: confirmedEssayLibrary(state.documents, 'public-university') };
  const result = readFulltextResult(await (await demoFetch('/api/fulltext-recall', post(input))).json(), input);
  assert.equal(result.paths.length, 1);
  assert(input.essays[0].text.includes(result.paths[0].sources[0].quote));
  assert(result.paths[0].adaptation_direction.includes('内容调整：'));
  assert(result.paths[0].adaptation_direction.includes('句式复用：'));
});
test('unrelated preset returns empty while unsupported prompts return an explicit failure', async () => {
  const state = await createPublicWorkspace();
  const input = { version: 4, currentDocumentId: 'public-space', taskPrompt: SPACE_PROMPT, essays: confirmedEssayLibrary(state.documents, 'public-space') };
  assert.deepEqual(readFulltextResult(await (await demoFetch('/api/fulltext-recall', post(input))).json(), input).paths, []);
  assert.equal((await demoFetch('/api/fulltext-recall', post({ ...input, taskPrompt: 'An arbitrary new question' }))).status, 422);
});
test('empty scene starts without confirmed history and excludes the current document', async () => {
  const empty = await createPublicWorkspace(true);
  assert.equal(confirmedEssayLibrary(empty.documents, empty.activeDocumentId).length, 0);
  const full = await createPublicWorkspace();
  assert.equal(confirmedEssayLibrary(full.documents, 'public-source').length, 0);
});
test('all URL modes stay in public storage, with independent normal and empty scenes', () => {
  for (const search of ['', '?demo=0', '?demo=research', '?demo=learner25']) {
    assert(workspaceStorageKey('example', search).startsWith('linguatype:public:20261028-v1:normal:'));
    assert.equal(isResearchDemoMode(search), false);
    assert.equal(isDemoMode(search), true);
  }
  assert.notEqual(workspaceStorageKey('example'), workspaceStorageKey('example', '?scene=empty'));
});
test('malformed, unknown and cancelled requests cannot reach a network fallback', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests++; throw new Error('NETWORK_FORBIDDEN'); };
  try {
    assert.equal((await demoFetch('/api/feedback', { body: 'bad-json' })).status, 422);
    assert.equal((await demoFetch('/api/research-library')).status, 422);
    assert.equal((await demoFetch('https://example.com')).status, 422);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(demoFetch('/api/scaffold', { signal: controller.signal }));
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});
