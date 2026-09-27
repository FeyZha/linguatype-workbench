import assert from 'node:assert/strict';
import test from 'node:test';
import { completeWriting, finishCompletion, readCompletionCandidates, sourceParts } from '../app/writing-completion.ts';
import { createEssayDocument, loadWorkspace, WORKSPACE_KEY } from '../app/workspace-state.ts';
import { POST } from '../app/api/language-extraction/route.ts';

test('completion snapshots survive edits, retries, stale results and reload', () => {
  const now = '2026-09-10T12:00:00.000Z';
  const original = createEssayDocument('doc', now, { taskPrompt: 'Learning', essay: 'Libraries provide access to books.' });
  const completed = completeWriting(original, 'version-1', now);
  assert.equal(original.completions, undefined);
  assert.equal(completeWriting(completed, 'duplicate', now), completed);
  const next = completeWriting({ ...completed, essay: 'My revised essay.' }, 'version-2', now);
  assert.equal(next.completions[0].essay, original.essay);
  assert.equal(next.documentId, original.documentId);
  const loading = { ...next, completions: next.completions.map(c => c.completionId === 'version-1' ? { ...c, status: 'loading', attemptId: 'new-attempt' } : c) };
  assert.deepEqual(finishCompletion(loading, 'version-1', 'old-attempt', []), loading);
  assert.deepEqual(finishCompletion(loading, 'deleted-version', 'new-attempt', []), loading);
  const meta = { model: 'test-model', promptVersion: 'test-version', callCount: 3, latencyMs: 1 };
  assert.deepEqual(finishCompletion(loading, 'version-1', 'new-attempt', [], meta).completions[0].analysisMeta, meta);
  const failed = finishCompletion(loading, 'version-1', 'new-attempt', null);
  assert.equal(failed.essay, next.essay);
  assert.equal(failed.completions[0].status, 'error'); assert.equal(failed.completions[0].errorKind, 'request_failed');
  assert.equal(failed.completions[0].essay, original.essay);
  const workspace = { version: 2, activeDocumentId: 'doc', savedAt: now, documents: [loading] };
  const restored = loadWorkspace({ getItem: key => key === WORKSPACE_KEY ? JSON.stringify(workspace) : null }, 'unused', now);
  assert.equal(restored.documents[0].completions[0].status, 'error'); assert.equal(restored.documents[0].completions[0].errorKind, 'interrupted');
  assert.equal(restored.documents[0].completions[0].attemptId, null);
  assert.equal(restored.documents[0].completions[1].essay, next.essay);
  assert.throws(() => completeWriting(createEssayDocument('blank', now), 'v1', now));
  assert.throws(() => loadWorkspace({ getItem: () => JSON.stringify({ ...workspace, documents: [{ ...loading, completions: [{}] }] }) }, 'unused', now));
  const card = (id, day) => ({ cardId: id, request: { targetSentence: id, requestedAt: `2026-09-${day}T00:00:00.000Z` } });
  const manyCards = { ...original, supportCards: [card('current-older', '08'), card('current-newest', '10')], archivedCards: Array.from({ length: 35 }, (_, i) => card(`archived-${i}`, '09')) };
  const snapshot = completeWriting(manyCards, 'prioritized', now).completions[0];
  assert.deepEqual(snapshot.helpCards.slice(0, 2).map(c => c.cardId), ['current-newest', 'current-older']);
  assert.equal(snapshot.helpCards.slice(0, 30).length, 30);
  assert.equal(manyCards.supportCards[0].cardId, 'current-older');
});

test('candidate boundary checks and repeated source highlights preserve original text', () => {
  const quote = 'Notebooks and books help; books are useful.';
  const parts = sourceParts(quote, 'books');
  assert.equal(parts.map(p => p.text).join(''), quote);
  assert.equal(parts.filter(p => p.highlighted).length, 2);
  assert.equal(sourceParts(quote, '')[0].text, quote);
  const completion = { essay: quote };
  const candidate = { meaningZh: '书籍', expression: 'books', conditions: '参照原句', sourceQuote: quote, reasonZh: '来自完成稿' };
  assert.equal(readCompletionCandidates({ version: 1, candidates: [candidate] }, completion)[0].decision, 'pending');
  for (const candidates of [[{ ...candidate, sourceQuote: 'Invented books.' }], [candidate, candidate], [{ ...candidate, expression: 'book' }], [{ ...candidate, decision: 'saved' }], [{ ...candidate, constructor: 'extra' }]]) assert.throws(() => readCompletionCandidates({ version: 1, candidates }, completion));
});

test('extraction endpoint keeps input failures and provider failures away from user text', async t => {
  const invalid = await POST(new Request('http://localhost/api/language-extraction', { method: 'POST', body: '{}' }));
  assert.equal(invalid.status, 400);
  const keys = ['base_url', 'api_key', 'model', 'provider'];
  const before = keys.map(k => process.env[k]);
  Object.assign(process.env, { base_url: 'https://test.invalid', api_key: 'test-only', model: 'test', provider: 'openai_compatible' });
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private diagnostic'); });
  try {
    const response = await POST(new Request('http://localhost/api/language-extraction', { method: 'POST', body: JSON.stringify({ taskPrompt: 'Transport', completedEssay: 'Buses ease congestion.', helpTargets: [], existingAssets: [] }) }));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { version: 1, error: 'EXTRACTION_UNAVAILABLE' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { keys.forEach((k, i) => before[i] === undefined ? delete process.env[k] : process.env[k] = before[i]); }
});
