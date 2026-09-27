import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAssetQuality, readQualityInput, readQualityResult } from '../../evals/expression-scaffold/experiments/vnext-asset-quality.ts';
import { EMPTY_ASSET_LIBRARY, saveLanguageAsset, applyAssetQuality, deleteLanguageAsset, isAssetLibrary, assetQualityInput } from '../app/language-assets.ts';
import { POST } from '../app/api/asset-quality/route.ts';

test('quality gate rejects malformed verdicts and missing sources; edited expressions reach content review', async () => {
  const input = { assetId: 'a1', revision: 2, meaningZh: '减轻压力', expression: 'ease pressure', conditions: '参照原句', sourceQuote: 'The policy eased pressure.', sourceEssay: 'The policy eased pressure.' };
  assert.equal(readQualityInput(input), input);
  for (const bad of [{ ...input, expected: 'usable' }, { ...input, revision: 0 }, { ...input, sourceEssay: 2 }]) assert.throws(() => readQualityInput(bad));
  for (const bad of [{ quality: 'usable', reason: 'uncertain' }, { quality: 'unknown', reason: 'ok' }, { quality: 'unusable', reason: 'english_error', replacement: 'help' }]) assert.throws(() => readQualityResult(bad));
  const unavailable = await checkAssetQuality({ ...input, sourceEssay: 'Unrelated source.' });
  assert.equal(unavailable.meta.callCount, 0);
  assert.equal(unavailable.result.quality, 'unusable');
  assert.equal(unavailable.modelInput, null);
  const env = ['base_url', 'api_key', 'model', 'provider'];
  const saved = Object.fromEntries(env.map(k => [k, process.env[k]]));
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, { base_url: 'https://example.invalid', api_key: 'test-not-secret', model: 'test', provider: 'deepseek' });
    globalThis.fetch = async (_url, options) => {
      calls++;
      const sent = JSON.parse(JSON.parse(options.body).messages[1].content);
      assert.equal(sent.expression, 'ease pressure');
      assert.equal(sent.sourceQuote, input.sourceQuote);
      assert(!Object.hasOwn(sent, 'expected'));
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'return_asset_quality', arguments: JSON.stringify({ quality: 'usable', reason: 'ok' }) } }] } }] });
    };
    const result = await checkAssetQuality(input);
    assert.equal(calls, 1);
    assert.equal(result.result.quality, 'usable');
    assert.equal(result.revision, 2);
    globalThis.fetch = async () => { throw new Error('private provider diagnostic'); };
    await assert.rejects(checkAssetQuality(input), error => error.message === 'MODEL_TRANSPORT_FAILED' && !JSON.stringify(error).includes('private provider diagnostic'));
  } finally {
    globalThis.fetch = fetchBefore;
    for (const k of env) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

test('quality responses bind to saved revisions without reviving deleted content or exposing diagnostics', async () => {
  const quote = 'Buses ease congestion.';
  const now = new Date().toISOString();
  const value = { assetId: 'a1', meaningZh: '缓解拥堵', expression: 'ease congestion', conditions: '参照原句', sourceQuote: quote, sourceDocumentId: 'doc1', sourceCompletionId: 'c1' };
  const saved = saveLanguageAsset(EMPTY_ASSET_LIBRARY, value, quote, now);
  const response = { version: 1, assetId: 'a1', revision: 1, quality: 'usable', checkedAt: now, promptVersion: 'vnext-asset-quality-v1-source-meaning', callCount: 1 , model: 'test-model'};
  const checked = applyAssetQuality(saved, response); assert.equal(checked.assets[0].qualityReview.model, 'test-model');
  assert.equal(checked.assets[0].quality, 'usable');
  assert(isAssetLibrary(JSON.parse(JSON.stringify(checked))));
  assert(!isAssetLibrary({ ...checked, assets: [{ ...checked.assets[0], qualityReview: undefined }] }));
  const edited = saveLanguageAsset(checked, { ...value, expression: 'reduce congestion' }, quote, now);
  assert.equal(edited.assets[0].quality, 'unreviewed');
  assert.equal(edited.assets[0].qualityReview, undefined);
  assert.deepEqual(applyAssetQuality(edited, response), edited);
  assert.equal(applyAssetQuality(deleteLanguageAsset(saved, 'a1'), response).assets.length, 0);
  assert.throws(() => applyAssetQuality(saved, { ...response, callCount: 0 }));
  const document = { documentId: 'doc1', essay: 'Entirely different draft.', completions: [{ completionId: 'c1', essay: quote }] };
  assert.equal(assetQualityInput(saved.assets[0], [document]).sourceEssay, quote);
  assert.equal(assetQualityInput(saved.assets[0], [{ ...document, completions: [] }]).sourceEssay, null);
  assert.equal(assetQualityInput(saved.assets[0], []).sourceEssay, quote);
  const localRejection = await POST(new Request('http://local/api/asset-quality', { method: 'POST', body: JSON.stringify({ ...assetQualityInput(saved.assets[0], [document]), sourceEssay: null }) }));
  assert.equal(localRejection.status, 200);
  const body = await localRejection.json();
  assert.equal(body.quality, 'unusable');
  assert.equal(body.callCount, 0);
  assert(!Object.hasOwn(body, 'reason'));
  assert(!Object.hasOwn(body, 'modelInput'));
  const invalid = await POST(new Request('http://local/api/asset-quality', { method: 'POST', body: '{}' }));
  assert.equal(invalid.status, 400);
});
