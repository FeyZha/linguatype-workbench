import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCAFFOLD_REQUEST_FAILED,
  readScaffoldResponse,
} from '../app/scaffold-response.ts';

const version = '1.0.0';
const headers = {
  'content-type': 'application/json',
  'x-linguatype-api-version': version,
};
const meta = {
  requestId: 'c4a1f920-7d1a-4fd5-883c-577ad06d1264',
  callCount: 1,
  latencyMs: 12,
  model: 'test-model',
  promptVersion: 'expression-scaffold-v7-expression-memory-v1',
};

function jsonResponse(body, status = 200, responseHeaders = headers) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

test('accepts both v1 success shapes', async () => {
  const direct = {
    memoryMatchIds: ['memory-1'],
    items: [{
      sourceZh: '缓解交通拥堵',
      action: 'provide_expression',
      recommendedExpression: 'ease traffic congestion',
      scaffolds: [],
    }],
    meta,
  };
  const complex = {
    memoryMatchIds: [],
    items: [{
      sourceZh: '投入更多资金来改善公共交通',
      action: 'offer_scaffolds',
      recommendedExpression: null,
      scaffolds: [
        { scaffoldId: 's1', focusZh: '投入更多资金', recommendedExpression: 'invest more money in ...' },
        { scaffoldId: 's2', focusZh: '改善公共交通', recommendedExpression: 'improve public transport' },
      ],
    }],
    meta,
  };

  assert.deepEqual(await readScaffoldResponse(jsonResponse(direct), version), {
    ok: true,
    result: direct,
  });
  assert.deepEqual(await readScaffoldResponse(jsonResponse(complex), version), {
    ok: true,
    result: complex,
  });
  const legacy = { ...direct, memoryMatchIds: undefined, meta: { ...meta, promptVersion: 'expression-scaffold-v7-full-controlled-rules' } };
  delete legacy.memoryMatchIds;
  assert.deepEqual(await readScaffoldResponse(jsonResponse(legacy), version), { ok: true, result: legacy });
});

test('rejects contract drift and exposes only safe errors', async () => {
  const missingVersion = await readScaffoldResponse(
    jsonResponse({}, 200, { 'content-type': 'application/json' }),
    version,
  );
  const malformed = await readScaffoldResponse(jsonResponse({ items: [] }), version);
  const spoofedContentType = await readScaffoldResponse(
    jsonResponse({}, 200, { ...headers, 'content-type': 'application/jsonp' }),
    version,
  );
  const configured = await readScaffoldResponse(
    jsonResponse({
      code: 'MODEL_NOT_CONFIGURED',
      error: 'internal detail',
      requestId: meta.requestId,
    }, 503),
    version,
  );

  assert.deepEqual(missingVersion, { ok: false, error: SCAFFOLD_REQUEST_FAILED, code: null });
  assert.deepEqual(malformed, { ok: false, error: SCAFFOLD_REQUEST_FAILED, code: null });
  assert.deepEqual(spoofedContentType, { ok: false, error: SCAFFOLD_REQUEST_FAILED, code: null });
  assert.deepEqual(configured, {
    ok: false,
    error: '内部模型尚未配置，原文没有被修改。',
    code: 'MODEL_NOT_CONFIGURED',
  });
});
