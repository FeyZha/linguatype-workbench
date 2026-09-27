import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecallInput, readRecallSelection } from '../app/prewriting-recall.ts';
import { recallLanguage } from '../app/server/prewriting-recall.ts';
import { POST } from '../app/api/prewriting-recall/route.ts';
import { createEssayDocument, isPersistedWorkspace, recoverWorkspace } from '../app/workspace-state.ts';
import { completeWriting } from '../app/writing-completion.ts';

test('prewriting only selects eligible existing revisions, never fills an empty library or accepts generated content', async t => {
  const asset = { assetId: 'a', revision: 2, meaningZh: '公交服务', expression: 'bus services', conditions: '', sourceQuote: 'Bus services matter.', type: 'language', confirmed: true, quality: 'usable', deleted: false };
  const input = { taskPrompt: 'Should cities fund buses?', assets: [asset] };
  assert.deepEqual(readRecallSelection({ assetIds: ['a'] }, readRecallInput(input)), [{ assetId: 'a', revision: 2 }]);
  for (const output of [{ assetIds: ['invented'] }, { assetIds: ['a', 'a'] }, { assetIds: ['a'], suggestion: 'A new idea' }, null]) assert.throws(() => readRecallSelection(output, input), /INVALID_OUTPUT/);
  for (const change of [{ deleted: true }, { confirmed: false }, { quality: 'unknown' }, { type: 'idea' }, { sourceQuote: '' }]) {
    const excluded = { ...input, assets: [{ ...asset, ...change }] };
    assert.throws(() => readRecallSelection({ assetIds: ['a'] }, excluded));
    assert.equal((await recallLanguage(excluded)).meta.callCount, 0);
  }
  assert.equal((await recallLanguage({ ...input, assets: [] })).meta.callCount, 0);
  for (const bad of [{ ...input, taskPrompt: '' }, { ...input, assets: [{ ...asset, revision: 0 }] }, { ...input, assets: [asset, asset] }, { ...input, extra: true }]) assert.throws(() => readRecallInput(bad));
  const settings = { base_url: 'https://example.invalid', api_key: 'test-only', model: 'test', provider: 'deepseek' };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.thinking.type, 'disabled');
    assert.equal(JSON.parse(sent.messages[1].content).assets.length, 1);
    return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'return_recall', arguments: '{"assetIds":["a"]}' } }] } }] });
  });
  assert.deepEqual((await recallLanguage(input)).selected, [{ assetId: 'a', revision: 2 }]);
  assert.equal(calls, 1);
  const request = value => new Request('http://localhost/api/prewriting-recall', { method: 'POST', body: JSON.stringify(value) });
  assert.equal((await POST(request({ ...input, taskPrompt: '' }))).status, 400);
  const result = await POST(request(input)), body = await result.json();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['meta', 'selected', 'version']);
  assert.equal(calls, 2);
  const now = '2026-09-10T14:00:00.000Z';
  const doc = { ...createEssayDocument('doc', now, { taskPrompt: input.taskPrompt, essay: 'My own text.' }), prewritingRequestedAt: now };
  const workspace = { version: 2, savedAt: now, activeDocumentId: 'doc', documents: [completeWriting(doc, 'c1', now)] };
  assert(isPersistedWorkspace(workspace));
  assert.equal(recoverWorkspace(workspace).documents[0].completions[0].prewritingRequestedAt, now);
  assert.equal(workspace.documents[0].essay, 'My own text.');
  workspace.documents[0].completions[0].prewritingRequestedAt = 'invalid';
  assert(!isPersistedWorkspace(workspace));
});
