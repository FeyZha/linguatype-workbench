import { reasonText } from '../app/reason-chains.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newWritingTrace, recordWritingEvent } from '../app/writing-trace.ts';
import { createEssayDocument, removeAssetHelp, recoverWorkspace, isPersistedWorkspace } from '../app/workspace-state.ts';
import { completeWriting } from '../app/writing-completion.ts';
import { analyzeIdeaUsage, ideaObservation, isIdeaUsageReviews, finishIdeaUsage } from '../app/idea-usage.ts';
import { countReusedDocuments } from '../app/usage-attribution.ts';

for (const kind of ['idea', 'reason']) test(kind + ' content reminders, prior paraphrase, mixed verdicts, unknown history and late deletion stay separate', async () => {
  const input = JSON.parse(readFileSync(new URL(`../../evals/expression-scaffold/eval-sets/vnext-${kind}-reuse.dev.v1/cases.json`, import.meta.url))).cases[0].input;
  const { asset, essay, taskPrompt } = input, now = '2026-09-11T00:00:00Z';
  const reason = kind === 'reason', field = reason ? 'reasonUsageReviews' : 'ideaUsageReviews', initialField = reason ? 'initialReasons' : 'initialIdeas';
  const sourceQuote = reason ? asset.nodes[0].sourceQuote : asset.sourceQuote;
  let d = { ...createEssayDocument('new', now, { taskPrompt, essay: '' }), writingTrace: newWritingTrace([], reason ? [] : [asset], reason ? [asset] : []) };
  d = recordWritingEvent(d, { eventId: 'shown', kind: 'exposure', level: 'chinese', content: reason ? reasonText(asset) : asset.textZh, assetId: asset.assetId, revision: asset.revision, shownAt: now });
  d = completeWriting({ ...d, essay }, 'done', now);
  const c = d.completions[0]; let calls = 0;
  const transport = async (path, options) => { calls++; assert.equal(path, '/api/' + kind + '-reuse'); const v = JSON.parse(options.body); return Response.json({ version: 1, result: { complete: true, occurrences: [{ verdict: 'appropriate', quote: v.essay }] }, meta: { callCount: 1, promptVersion: 'test-version', model: 'test-only', latencyMs: 0 } }); };
  const start = { asset, attemptId: 'attempt', status: 'loading', correction: 'none' };
  const r = { ...start, status: 'ready', ...await analyzeIdeaUsage(c, asset, new AbortController().signal, transport) };
  assert.equal(calls, 1); assert.equal(r.modelCalls.length, 1); assert.equal(r.modelCalls[0].promptVersion, 'test-version'); assert.equal(isIdeaUsageReviews([r], c, reason), true);
  const o = ideaObservation('new', c, r); assert.equal(o.finalExpression.assistance, 'chinese'); assert.equal(o.eligibility, 'yes');
  assert.equal(countReusedDocuments([o, o], asset.assetId, asset.revision), 1);
  assert.equal(countReusedDocuments([ideaObservation('new', c, { ...r, correction: 'exclude' })], asset.assetId, asset.revision), 0);
  assert.equal(ideaObservation('new', c, { ...r, correction: 'external' }).finalExpression.assistance, 'unknown');
  const bad = structuredClone(r); bad.priors = []; assert.equal(isIdeaUsageReviews([bad], c, reason), false);
  const mixed = { ...r, result: { complete: true, occurrences: [{ verdict: 'appropriate', quote: essay }, { verdict: 'inappropriate', quote: essay }] } };
  assert.equal(countReusedDocuments([ideaObservation('new', c, mixed)], asset.assetId, asset.revision), 0);
  const prior = { ...c, writingTrace: { ...c.writingTrace, events: c.writingTrace.events.map(e => ({ ...e, essayBefore: sourceQuote })) } };
  const earlier = { ...r, ...await analyzeIdeaUsage(prior, asset, new AbortController().signal, transport) };
  assert.equal(ideaObservation('new', prior, earlier).earlierExpression.assistance, 'unprompted_observed');
  assert.equal(ideaObservation('new', prior, earlier).finalExpression.assistance, 'chinese');
  const legacy = { ...c, writingTrace: { ...c.writingTrace, [initialField]: undefined } };
  assert.equal(ideaObservation('new', legacy, r).eligibility, 'unknown');
  const uncertain = { ...r, priors: [{ eventId: 'shown', result: { complete: false, occurrences: [] } }] };
  assert.equal(ideaObservation('new', c, uncertain).finalExpression.assistance, 'unknown');
  const many = { ...c, writingTrace: { ...c.writingTrace, sequence: 16, events: Array.from({ length: 8 }, (_, i) => ({ ...c.writingTrace.events[0], eventId: 'event-' + i, order: (i + 1) * 2, essayBefore: 'This is complete sentence number ' + i + '.' })) } };
  const bounded = { ...r, ...await analyzeIdeaUsage(many, asset, new AbortController().signal, transport) };
  assert.equal(bounded.callCount, 6); assert.equal(bounded.priors.length, 8);
  assert.equal(isIdeaUsageReviews([bounded], many, reason), true);
  assert.equal(ideaObservation('new', many, bounded).finalExpression.assistance, 'unknown');
  const pending = { ...d, completions: [{ ...c, [field]: [start] }] };
  const finished = finishIdeaUsage(pending, c, r, [asset]);
  assert.equal(finished.completions[0][field][0].status, 'ready');
  assert.equal(removeAssetHelp(finished, 'unrelated').completions[0][field][0].status, 'ready');
  assert.equal(finishIdeaUsage(pending, c, r, [{ ...asset, revision: 2 }]).completions[0][field][0].status, 'error');
  assert.equal(finishIdeaUsage(removeAssetHelp(pending, asset.assetId), c, r, []).completions[0][field].length, 0);
  const w = { version: 2, documents: [pending], activeDocumentId: 'new', savedAt: now };
  assert.equal(isPersistedWorkspace(w), true); assert.equal(recoverWorkspace(w).documents[0].completions[0][field][0].errorKind, 'interrupted');
  await assert.rejects(analyzeIdeaUsage(c, asset, new AbortController().signal, async () => Response.json({}, { status: 502 })));
});

for (const kind of ['idea', 'reason']) test(kind + ' actual shown meaning overrides IDs, deduplicates and preserves relation records', async () => {
  const { asset, essay, taskPrompt } = JSON.parse(readFileSync(new URL(`../../evals/expression-scaffold/eval-sets/vnext-${kind}-reuse.dev.v1/cases.json`, import.meta.url))).cases[0].input;
  const now = '2026-09-11T00:00:00Z', reason = kind === 'reason';
  let d = { ...createEssayDocument('new', now, { taskPrompt, essay: '' }), writingTrace: newWritingTrace([], reason ? [] : [asset], reason ? [asset] : []) };
  for (const [eventId, content, level, binding] of [['other-id', 'Equivalent meaning', 'chinese', { assetId: 'another', revision: 1 }], ['no-id', 'Equivalent meaning', 'chinese', {}], ['wrong-same-id', 'Unrelated statement', 'english', { assetId: asset.assetId, revision: asset.revision }], ['unclear', 'It does this.', 'full_reference', {}]]) {
    d = recordWritingEvent(d, { eventId, content, level, ...binding, kind: 'exposure', shownAt: now });
  }
  const c = completeWriting({ ...d, essay }, 'done', now).completions[0]; let calls = 0;
  const transport = async (path, options) => {
    calls++; const input = JSON.parse(options.body);
    const result = path === '/api/content-relevance' ? input.events.map(e => ({ eventId: e.eventId, relation: e.content === 'Equivalent meaning' ? 'yes' : e.content === 'Unrelated statement' ? 'no' : 'unknown' })) : { complete: true, occurrences: [{ verdict: 'appropriate', quote: essay }] };
    if (path === '/api/content-relevance') assert.equal(input.events.length, 3);
    return Response.json({ version: 1, result, meta: { callCount: 1, promptVersion: 'test', model: 'test-only', latencyMs: 1 } });
  };
  const r = { asset, attemptId: 'a', status: 'ready', correction: 'none', ...await analyzeIdeaUsage(c, asset, new AbortController().signal, transport) };
  assert.equal(calls, 2); assert.deepEqual(r.relations.map(e => e.relation), ['yes', 'yes', 'no', 'unknown']);
  assert.equal(isIdeaUsageReviews([r], c, reason), true);
  assert.deepEqual(ideaObservation('new', c, r).evidence.events.map(e => e.relation), ['yes', 'yes', 'no', 'unknown']);
  assert.equal(ideaObservation('new', c, r).finalExpression.assistance, 'unknown');
  const broken = structuredClone(r); broken.relations.pop(); assert.equal(isIdeaUsageReviews([broken], c, reason), false);
  const legacy = { ...r, relations: undefined }; assert.equal(isIdeaUsageReviews([legacy], c, reason), true);
  assert.equal(ideaObservation('new', c, legacy).evidence.events[2].relation, 'unknown');
});
