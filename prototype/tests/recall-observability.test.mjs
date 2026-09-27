import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { POST } from '../app/api/argument-asset-recall/route.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from '../app/argument-asset-recall.ts';

const workspace = JSON.parse(readFileSync(new URL('../../evals/argument-asset-loop/runs/learner-themes-25-v1-20260926/workspace.json', import.meta.url), 'utf8'));
const assets = workspace.argumentAssets.slice(0, 2);
const ids = assets.map(asset => asset.assetId);
const secret = 'SYNTHETIC_CREDENTIAL_SENTINEL';
const privateText = 'SYNTHETIC_PRIVATE_BODY_SENTINEL';
const input = { taskPrompt: privateText, currentDraft: privateText, assets };
const check = assetId => ({ assetId, relevant: true });
const normal = stage => stage === 'candidate' ? { matches: ids.map(assetId => ({ assetId })) } : { checks: ids.map(check) };
const envelope = (name, output) => Response.json({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name, arguments: JSON.stringify(output) } }] } }] });
const timeout = () => Object.assign(new Error(privateText), { name: 'TimeoutError' });

// Replace the environment object rather than reading or retaining individual credentials.
async function exercise({ inject, body = JSON.stringify(input), runId = 'synthetic-observability', logThrows = false } = {}) {
  const oldEnv = process.env, oldFetch = globalThis.fetch, oldInfo = console.info;
  const events = [], calls = [], attempts = { candidate: 0, verification: 0 };
  process.env = { base_url: 'https://test.invalid', api_key: secret, model: 'synthetic-model', provider: 'deepseek' };
  console.info = text => { if (logThrows) throw new Error('Synthetic logger failure'); events.push(JSON.parse(text)); };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://test.invalid/beta/chat/completions');
    const request = JSON.parse(init.body);
    const name = request.tool_choice.function.name;
    const stage = name === 'return_related_thought_ids' ? 'candidate' : 'verification';
    const attempt = ++attempts[stage];
    calls.push({ stage, attempt });
    return await inject?.({ stage, attempt, name }) ?? envelope(name, normal(stage));
  };
  try {
    const response = await POST(new Request('http://test.invalid/api/argument-asset-recall', { method: 'POST', headers: { 'x-recall-run-id': runId }, body }));
    const data = await response.json();
    const serialized = JSON.stringify({ events, data });
    for (const sentinel of [secret, privateText, assets[0].thought]) assert(!serialized.includes(sentinel), 'Logs and responses must not contain credentials, bodies, or asset contents');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    if (!logThrows) {
      for (const event of events) {
        assert.equal(event.scope, 'argument-asset-recall');
        assert.equal(event.requestId, response.headers.get('x-request-id'));
        assert.equal(event.runId, /^[a-zA-Z0-9_-]{1,100}$/.test(runId) ? runId : null);
        assert.equal(event.promptVersion, ARGUMENT_ASSET_RECALL_PROMPT_VERSION);
        assert(Number.isFinite(Date.parse(event.timestamp)));
      }
      assert.equal(events[0].event, 'request_start');
      const end = events.at(-1);
      assert.equal(end.event, 'request_end');
      assert.equal(end.httpStatus, response.status);
      assert.equal(end.modelCalls, calls.length);
      assert.equal(end.retries, calls.filter(call => call.attempt > 1).length);
      assert.equal(end.firstAttemptSuccess, response.status === 200 && !events.some(event => event.errorType));
      for (const call of calls) {
        for (const eventName of ['provider_start', 'provider_end']) assert.equal(events.filter(event => event.event === eventName && event.stage === call.stage && event.attempt === call.attempt).length, 1);
      }
      for (const stage of new Set(calls.map(call => call.stage))) {
        assert.equal(events.filter(event => event.event === 'stage_start' && event.stage === stage).length, 1);
        assert.equal(events.filter(event => event.event === 'stage_end' && event.stage === stage).length, 1);
      }
      const verificationStart = events.find(event => event.event === 'stage_start' && event.stage === 'verification');
      if (verificationStart) assert.deepEqual(verificationStart.targetAssetIds, ids);
      if (response.status !== 200) assert.deepEqual(data, { version: 2, error: response.status === 400 ? 'INVALID_INPUT' : 'RECALL_UNAVAILABLE' });
      else assert.equal(data.meta.callCount, calls.length);
    }
    return { status: response.status, data, events, calls, end: events.at(-1) };
  } finally { process.env = oldEnv; globalThis.fetch = oldFetch; console.info = oldInfo; }
}

test('recall fault injection preserves behavior and attributes failures without sensitive contents', async t => {
  await t.test('normal two-stage success and observability failure isolation', async () => {
    const result = await exercise();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.matches, ids.map(assetId => ({ assetId })));
    assert.equal(result.end.firstAttemptSuccess, true);
    assert.equal(result.end.failedStage, null);
    for (const event of result.events.filter(event => event.event === 'provider_end')) assert.equal(event.httpStatus, 200);
    assert.equal((await exercise({ logThrows: true })).status, 200);
    assert.equal((await exercise({ runId: 'invalid run id' })).end.runId, null);
  });
  for (const stage of ['candidate', 'verification']) {
    for (const status of [429, 502, 503]) await t.test(`${stage}: provider HTTP ${status} does not retry`, async () => {
      const result = await exercise({ inject: context => context.stage === stage ? new Response(`${privateText} ${secret}`, { status }) : undefined });
      assert.equal(result.status, 502);
      assert.equal(result.end.errorType, 'provider_http');
      assert.equal(result.end.failedStage, stage);
      assert.equal(result.end.retries, 0);
      const failure = result.events.find(event => event.event === 'provider_end' && event.stage === stage);
      assert.equal(failure.httpStatus, status);
      assert.equal(failure.willRetry, false);
    });
    for (const [kind, makeError] of [['timeout', timeout], ['network_or_runtime', () => new TypeError(privateText)]]) await t.test(`${stage}: ${kind} before response headers does not retry`, async () => {
      const result = await exercise({ inject: context => { if (context.stage === stage) throw makeError(); } });
      assert.equal(result.status, 502);
      assert.equal(result.end.errorType, kind);
      assert.equal(result.end.failedStage, stage);
      assert.equal(result.end.retries, 0);
      assert.equal(result.events.find(event => event.event === 'provider_end' && event.stage === stage).httpStatus, undefined);
    });
    const failures = [
      ['empty body', 'response_json_parse', () => new Response('')],
      ['invalid body JSON', 'response_json_parse', () => new Response(privateText)],
      ['missing tool envelope', 'tool_envelope', () => Response.json({ error: privateText })],
      ['wrong tool name', 'tool_envelope', () => envelope('wrong_tool', {})],
      ['non-string arguments', 'tool_envelope', name => Response.json({ choices: [{ message: { tool_calls: [{ function: { name, arguments: {} } }] } }] })],
      ['invalid arguments JSON', 'tool_json_parse', name => Response.json({ choices: [{ message: { tool_calls: [{ function: { name, arguments: privateText } }] } }] })],
      ['body read timeout', 'timeout', () => ({ ok: true, status: 200, json: async () => { throw timeout(); } })],
    ];
    for (const [label, errorType, makeResponse] of failures) for (const recover of [true, false]) await t.test(`${stage}: ${label}, ${recover ? 'first failure recovers' : 'both attempts fail'}`, async () => {
      const result = await exercise({ inject: context => context.stage === stage && (!recover || context.attempt === 1) ? makeResponse(context.name) : undefined });
      assert.equal(result.status, recover ? 200 : 502);
      assert.equal(result.end.firstAttemptSuccess, false);
      assert.equal(result.end.retries, 1);
      assert.equal(result.end.failedStage, recover ? null : stage);
      if (!recover) assert.equal(result.end.errorType, errorType);
      const ends = result.events.filter(event => event.event === 'provider_end' && event.stage === stage);
      assert.equal(ends.length, 2);
      assert.equal(ends[0].errorType, errorType);
      assert.equal(ends[0].httpStatus, 200);
      assert.equal(ends[0].willRetry, true);
      assert.equal(ends[1].errorType, recover ? undefined : errorType);
      if (!recover) assert.equal(ends[1].willRetry, false);
    });
    await t.test(`${stage}: schema errors do not retry and discard the whole batch`, async () => {
      const bad = stage === 'candidate' ? { matches: [{ assetId: ids[0] }, { assetId: 'invented' }] } : { checks: [check(ids[0]), { ...check(ids[1]), relevant: 'true' }] };
      const result = await exercise({ inject: context => context.stage === stage ? envelope(context.name, bad) : undefined });
      assert.equal(result.status, 502);
      assert.equal(result.end.errorType, 'schema_validation');
      assert.equal(result.end.failedStage, stage);
      assert.equal(result.end.retries, 0);
      assert.equal(result.calls.length, stage === 'candidate' ? 1 : 2);
      assert.equal(result.data.matches, undefined);
      if (stage === 'verification') {
        const provider = result.events.findLast(event => event.event === 'provider_end');
        assert.equal(provider.httpStatus, 200);
        assert.equal(provider.errorType, undefined, 'Transport and JSON parsing succeeded');
        const failed = result.events.findLast(event => event.event === 'stage_end');
        assert.equal(failed.validation.error.path, '$.checks[1].relevant');
        assert.equal(failed.validation.error.code, 'VERIFIER_BOOLEAN_TYPE');
        assert.equal(failed.validation.domainPassed, false);
      }
    });
    await t.test(`${stage}: valid empty output is success`, async () => {
      const result = await exercise({ inject: context => context.stage === stage ? envelope(context.name, stage === 'candidate' ? { matches: [] } : { checks: ids.map(assetId => ({ assetId, relevant: false })) }) : undefined });
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.matches, []);
      assert.equal(result.end.firstAttemptSuccess, true);
      assert.equal(result.calls.length, stage === 'candidate' ? 1 : 2);
    });
  }
  await t.test('both stages retry once: four model calls and two retries', async () => {
    const result = await exercise({ inject: context => context.attempt === 1 ? new Response('') : undefined });
    assert.equal(result.status, 200);
    assert.equal(result.end.modelCalls, 4);
    assert.equal(result.end.retries, 2);
    assert.equal(result.end.firstAttemptSuccess, false);
  });
  await t.test('untrusted provider finish reason cannot put sensitive text into logs', async () => {
    const result = await exercise({ inject: ({ stage, name }) => Response.json({ choices: [{ finish_reason: `${privateText} ${secret}`, message: { tool_calls: [{ function: { name, arguments: JSON.stringify(normal(stage)) } }] } }] }) });
    assert.equal(result.status, 200);
  });
  await t.test('valid negative verification is filtered, not a batch failure', async () => {
    const result = await exercise({ inject: context => context.stage === 'verification' ? envelope(context.name, { checks: [check(ids[0]), { ...check(ids[1]), relevant: false }] }) : undefined });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.matches, [{ assetId: ids[0] }]);
  });
  for (const body of ['', '{']) await t.test('malformed request JSON retains 502 with request_json_parse', async () => {
    const result = await exercise({ body });
    assert.equal(result.status, 502);
    assert.equal(result.end.errorType, 'request_json_parse');
    assert.equal(result.end.failedStage, 'request');
    assert.equal(result.calls.length, 0);
  });
  await t.test('invalid input is 400; no assets is successful without calls', async () => {
    const invalid = await exercise({ body: JSON.stringify({ ...input, taskPrompt: '' }) });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.end.errorType, 'input_validation');
    const empty = await exercise({ body: JSON.stringify({ ...input, assets: [] }) });
    assert.equal(empty.status, 200);
    assert.equal(empty.calls.length, 0);
    assert.deepEqual(empty.data.matches, []);
  });
});
