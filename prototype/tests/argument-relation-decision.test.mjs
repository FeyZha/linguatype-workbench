import assert from 'node:assert/strict';
import test from 'node:test';
import { decideRelation, readRelationVerification, relationSchema } from '../app/server/argument-asset-relation.ts';
import { VerifierContractError } from '../app/server/argument-asset-verification.ts';

const base = { assetId: 'a', relationMatch: 'same', prerequisite: 'satisfied', contribution: 'direct', contributionBasis: 'main_relation' };
test('frozen relation decision table protects useful boundaries without accepting missing direct triggers', () => {
  for (const [name, patch, accept] of [
    ['same relation direct', {}, true],
    ['partial saved relation can directly support the current question', { relationMatch: 'partial' }, true],
    ['same object different relation', { relationMatch: 'different' }, false],
    ['direct contradicted', { prerequisite: 'contradicted' }, false],
    ['triggered exception', { contribution: 'exception', contributionBasis: 'supported_boundary' }, true],
    ['useful partial', { relationMatch: 'partial', contribution: 'partial' }, true],
    ['abstract overlap', { relationMatch: 'partial', contribution: 'none' }, false],
    ['same action different trigger', { prerequisite: 'contradicted', contribution: 'partial' }, false],
    ['different setting same mechanism', { prerequisite: 'not_required' }, true],
    ['invented trigger', { prerequisite: 'missing' }, false],
    ['main premise absent but explicit exception', { prerequisite: 'contradicted', contribution: 'exception', contributionBasis: 'supported_boundary' }, true],
    ['missing safeguard is current question', { prerequisite: 'missing', contribution: 'limit', contributionBasis: 'supported_boundary' }, true],
    ['independent saved reason', { prerequisite: 'contradicted', contribution: 'partial', contributionBasis: 'supported_independent_relation' }, true],
    ['partial cannot launder a boundary', { prerequisite: 'contradicted', contribution: 'partial', contributionBasis: 'supported_boundary' }, false],
  ]) assert.equal(decideRelation({ ...base, ...patch }), accept, name);
});

test('internal enum schema rejects malformed responses instead of disguising them as empty recall', () => {
  assert.deepEqual(readRelationVerification({ parameters: { checks: [base] } }, ['a']).matches, [{ assetId: 'a' }]);
  assert.deepEqual(relationSchema(['a']).properties.checks.items.properties.assetId.enum, ['a']);
  for (const value of [
    { checks: [{ ...base, prerequisite: 'probably' }] },
    { checks: [{ ...base, relevant: true }] },
    { checks: [{ ...base, reason: 'PRIVATE' }] },
    { checks: [{ ...base, assetId: 'unknown' }] },
    { checks: [base, base] }, { checks: [] },
    { checks: [base], detail: 'high' },
    { parameters: { parameters: { checks: [base] } } },
    { parameters: { checks: [base] }, checks: [base] },
  ]) assert.throws(() => readRelationVerification(value, ['a']), error => error instanceof VerifierContractError && !JSON.stringify(error.diagnostic).includes('PRIVATE'));
});
