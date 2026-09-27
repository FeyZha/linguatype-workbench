import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readIdeaRecallInput, readIdeaRecall, readIdeaReuseResult } from '../app/idea-reuse.ts';
import { recallIdeas, checkIdeaReuse } from '../app/server/idea-reuse.ts';

test('idea recall keeps existing eligible revisions; usage evidence stays ordered, grounded and type-specific', async () => {
  const set = JSON.parse(readFileSync(new URL('../../evals/expression-scaffold/eval-sets/vnext-idea-reuse.dev.v1/cases.json', import.meta.url), 'utf8'));
  const input = set.cases[0].input, asset = input.asset;
  const recall = readIdeaRecallInput({ taskPrompt: input.taskPrompt, assets: [asset] });
  assert.deepEqual(readIdeaRecall({ assetIds: [asset.assetId] }, recall), [{ assetId: asset.assetId, revision: 1 }]);
  assert.throws(() => readIdeaRecall({ assetIds: ['invented'] }, recall));
  assert.throws(() => readIdeaRecall({ assetIds: [asset.assetId, asset.assetId] }, recall));
  const excluded = { ...recall, assets: [{ ...asset, quality: 'unreviewed' }] };
  assert.throws(() => readIdeaRecall({ assetIds: [asset.assetId] }, excluded));
  assert.equal((await recallIdeas(excluded)).meta.callCount, 0);
  assert.equal((await checkIdeaReuse({ ...input, essay: '' })).meta.callCount, 0);
  const first = input.essay, second = 'Only governments can tackle all environmental problems.';
  const essay = first + ' ' + second;
  const output = { complete: true, occurrences: [{ verdict: 'appropriate', quote: first }, { verdict: 'inappropriate', quote: second }] };
  assert.deepEqual(readIdeaReuseResult(output, { ...input, essay }), output);
  assert.throws(() => readIdeaReuseResult({ ...output, occurrences: [...output.occurrences].reverse() }, { ...input, essay }));
  assert.throws(() => readIdeaReuseResult({ ...output, occurrences: [{ verdict: 'appropriate', quote: asset.sourceQuote }] }, input));
  assert.throws(() => readIdeaReuseResult({ ...output, occurrences: [{ verdict: 'appropriate', quote: 'governments can tackle all environmental problems.' }] }, { ...input, essay }));
});
