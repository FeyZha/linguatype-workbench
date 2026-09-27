import assert from 'node:assert/strict';
import test from 'node:test';
import { lockedMatchItems, readMatchingInput, readMatches, matchLanguage } from '../../evals/expression-scaffold/experiments/vnext-matching.ts';

test('matching preserves locked items and rejects ineligible or invented asset choices', async () => {
  const targetSentence = 'Cities should 施加限制 while 保护居民.';
  const asset = { assetId: 'a1', type: 'language', confirmed: true, quality: 'usable', deleted: false, meaningZh: '施加限制', expression: 'impose restrictions on', conditions: '参照原句', sourceQuote: 'Governments impose restrictions on traffic.' };
  const input = { taskPrompt: 'Tourism', fullEssay: targetSentence, targetSentence, items: lockedMatchItems(targetSentence), assets: [asset] };
  assert.equal(readMatchingInput(input), input);
  assert.equal(readMatchingInput({ ...input, items: input.items.map(i => ({ sourceZh: i.sourceZh, itemId: i.itemId })) }).items.length, 2);
  assert.throws(() => readMatchingInput({ ...input, items: input.items.slice(1) }));
  assert.throws(() => readMatchingInput({ ...input, completedEssay: 'A future result.' }));
  const matches = [{ itemId: 'i1', assetId: 'a1', coverage: 'partial' }, { itemId: 'i2', assetId: null, coverage: 'none' }];
  assert.deepEqual(readMatches({ matches }, input), matches);
  for (const bad of [{ matches: matches.slice(1) }, { matches: [...matches].reverse() }, { matches: [{ ...matches[0], assetId: 'invented' }, matches[1]] }, { matches: [{ ...matches[0], coverage: 'none' }, matches[1]] }]) assert.throws(() => readMatches(bad, input));
  for (const change of [{ confirmed: false }, { type: 'idea' }, { quality: 'unreviewed' }, { quality: 'unusable' }, { quality: 'unknown' }, { deleted: true }, { sourceQuote: '' }]) {
    const blocked = { ...input, assets: [{ ...asset, ...change }] };
    assert.throws(() => readMatches({ matches }, blocked));
    const result = await matchLanguage(blocked);
    assert.equal(result.meta.callCount, 0);
    assert(result.matches.every(m => m.coverage === 'none' && m.assetId === null));
    assert.deepEqual(result.modelInput.assets, []);
  }
});
