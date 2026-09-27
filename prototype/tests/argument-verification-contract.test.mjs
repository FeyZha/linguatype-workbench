import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readVerification, verificationSchema, VerifierContractError } from '../app/server/argument-asset-verification.ts';

test('minimal verifier contract accepts only complete candidate judgments and safe sole wrapper', () => {
  const output = { checks: [{ assetId: 'a', relevant: true }, { assetId: 'b', relevant: false }] };
  for (const value of [output, { arguments: output }, { call: JSON.stringify(output) }, { method: 'verify_thought_relevance', parameters: output }, { detail: 'high', ...output }, { arguments: JSON.stringify(output) }, { parameters: output }, { toolId: 'verify_thought_relevance', ...output }, { signal: 'tool_call', toolName: 'verify_thought_relevance', parameters: output }]) {
    const result = readVerification(value, ['a', 'b']);
    assert.deepEqual(result.matches, [{ assetId: 'a' }]);
    assert.equal(result.diagnostic.domainPassed, true);
    assert.equal(result.diagnostic.schemaParsePassed, true);
  }
  assert.deepEqual(readVerification({ checks: [{assetId: 'a', reason: 'optional audit only', relevant: false}] }, ['a']).matches, []);
  assert.equal(readVerification({ parameters: output }, ['a', 'b']).diagnostic.normalization, 'parameters_wrapper');
  assert.deepEqual(verificationSchema(['a', 'b']).properties.checks.items.properties.assetId.enum, ['a', 'b']);
  for (const [value, code, path] of [
    [{ checks: [{ assetId: 'invented', relevant: true }] }, 'NON_CANDIDATE_ID', '$.checks[0].assetId'],
    [{ checks: [{ assetId: 'existing-but-not-selected', relevant: false }] }, 'NON_CANDIDATE_ID', '$.checks[0].assetId'],
    [{ checks: [{ assetId: 'a' }] }, 'MISSING_FIELD', '$.checks[0].relevant'],
    [{ checks: [{ relevant: true }] }, 'MISSING_FIELD', '$.checks[0].assetId'],
    [{ checks: [{ assetId: 'a', relevant: 'true' }] }, 'BOOLEAN_TYPE', '$.checks[0].relevant'],
    [{ checks: [{ assetId: 'a', relevant: null }] }, 'BOOLEAN_TYPE', '$.checks[0].relevant'],
    [{ checks: [{ assetId: 'a', relevant: true, explanation: 'PRIVATE' }] }, 'EXTRA_FIELD', '$.checks[0].<extra>'],
    [{ checks: [{ assetId: 'a', relevant: true }, { assetId: 'a', relevant: false }] }, 'DUPLICATE_ID', '$.checks[1].assetId'],
    [{ checks: [] }, 'COVERAGE', '$.checks'],
    [{ reason: 'PRIVATE', checks: [] }, 'EXTRA_FIELD', '$.<extra>'],
    [{ detail: 'placeholder' }, 'EXTRA_FIELD', '$.<extra>'],
    [{ detail: false, ...output }, 'EXTRA_FIELD', '$.<extra>'],
    [{ method: 'wrong_tool', parameters: output }, 'EXTRA_FIELD', '$.<extra>'],
    [{ call: '{' }, 'ARGUMENTS_PARSE', '$.call'],
    [{ checks: [{assetId:'a', relevant:true, reason: 12}] }, 'REASON_TYPE', '$.checks[0].reason'],
    [{ checks: [{assetId:'a', relevant:true, reason: 'x'.repeat(241)}] }, 'REASON_TYPE', '$.checks[0].reason'],
    [{ arguments: '{' }, 'ARGUMENTS_PARSE', '$.arguments'],
    [{ arguments: JSON.stringify(output), checks: [] }, 'EXTRA_FIELD', '$.<extra>'],
    [{ arguments: JSON.stringify({arguments: JSON.stringify(output)}) }, 'EXTRA_FIELD', '$.<extra>'],
    [null, 'ROOT_TYPE', '$'], ['{', 'ROOT_TYPE', '$'],
    [{}, 'MISSING_FIELD', '$.checks'],
    [{ checks: null }, 'CHECKS_TYPE', '$.checks'],
    [{ checks: [null] }, 'CHECK_TYPE', '$.checks[0]'],
    [{ checks: [{ assetId: 1, relevant: true }] }, 'ID_TYPE', '$.checks[0].assetId'],
    [{ signal: 'tool_call', toolName: 'wrong_tool', parameters: output }, 'EXTRA_FIELD', '$.<extra>'],
    [{ signal: 'tool_call', toolName: 'verify_thought_relevance', parameters: output, checks: [] }, 'EXTRA_FIELD', '$.<extra>'],
    [{ toolId: 'wrong_tool', ...output }, 'EXTRA_FIELD', '$.<extra>'],
    [{ parameters: output, checks: [] }, 'EXTRA_FIELD', '$.<extra>'],
  ]) {
    assert.throws(() => readVerification(value, ['a']), error => {
      assert(error instanceof VerifierContractError);
      assert.equal(error.diagnostic.error.code, 'VERIFIER_' + code);
      assert.equal(error.diagnostic.error.path, path);
      assert.equal(error.diagnostic.domainPassed, false);
      assert(!JSON.stringify(error.diagnostic).includes('PRIVATE'));
      return true;
    });
  }
});

test('captured real fixture wrappers normalize, but a placeholder never becomes an empty result', () => {
  const root = new URL('../../evals/argument-asset-loop/runs/recall-verifier-contract-scope-20260927/', import.meta.url);
  let accepted = 0, rejected = 0;
  for (const file of ['v13-raw-replay.json', 'v14-raw-replay.json', 'v16-raw-replay.json', 'v17-raw-replay.json', 'v17-formats-replay.json']) {
    const { records } = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    for (const record of records) {
      const candidateIds = record.events.find(event => event.event === 'stage_start' && event.stage === 'verification').targetAssetIds;
      const envelope = JSON.parse(record.raw.find(item => item.stage === 'verify_thought_relevance').body);
      const raw = JSON.parse(envelope.choices[0].message.tool_calls[0].function.arguments);
      if (raw.detail === 'placeholder' && !raw.checks) {
        assert.throws(() => readVerification(raw, candidateIds), VerifierContractError);
        rejected++;
      } else {
        assert.equal(readVerification(raw, candidateIds).diagnostic.domainPassed, true);
        accepted++;
      }
    }
  }
  assert(accepted > 30);
  assert.equal(rejected, 1);
});
