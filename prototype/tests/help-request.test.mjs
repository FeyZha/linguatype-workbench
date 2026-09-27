import assert from 'node:assert/strict';
import test from 'node:test';
import { requestHelp } from '../app/help-request.ts';
import { HELP_VERSION } from '../app/help-package.ts';

test('skip and timeout ignore late matches; requests and hidden packages remain separate', async () => {
  const originalFetch = globalThis.fetch;
  const asset = { assetId: 'a1', revision: 2, meaningZh: '缓解拥堵', expression: 'ease congestion', conditions: '', sourceQuote: 'Buses ease congestion.', type: 'language', quality: 'usable', confirmed: true, deleted: false };
  const input = { taskPrompt: 'Transport', fullEssay: 'Buses can 缓解拥堵.', targetSentence: 'Buses can 缓解拥堵.', assets: [asset] };
  const newPack = { version: HELP_VERSION, items: [{ itemId: 'i1', sourceZh: '缓解拥堵', kind: 'new', scaffold: { sourceZh: '缓解拥堵', action: 'provide_expression', recommendedExpression: 'reduce congestion', scaffolds: [] } }], meta: { generationCalls: 1 } };
  const oldPack = { version: HELP_VERSION, items: [{ itemId: 'i1', sourceZh: '缓解拥堵', kind: 'saved', assetId: 'a1', assetRevision: 2, meaningZh: asset.meaningZh, expression: asset.expression, conditions: '', sourceQuote: asset.sourceQuote }], meta: { generationCalls: 0 } };
  try {
    for (const outcome of ['matched', 'skipped', 'timeout', 'unavailable', 'no_candidates']) {
      const calls = [], phases = [];
      let lateResolve;
      const skip = new AbortController();
      globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body); calls.push({ url, body });
        if (url === '/api/language-match') {
          if (outcome === 'unavailable') return Response.json({}, { status: 502 });
          if (outcome === 'matched') return Response.json({ version: 1, matches: [{ itemId: 'i1', assetId: 'a1', coverage: 'full' }], meta: { callCount: 1 } });
          return new Promise(resolve => { lateResolve = resolve; });
        }
        assert.equal(url, '/api/vnext-help');
        assert.equal(body.targetSentence, input.targetSentence);
        assert.equal(body.matches === null, outcome !== 'matched');
        return Response.json(outcome === 'matched' ? oldPack : newPack);
      };
      const pending = requestHelp({ ...input, assets: outcome === 'no_candidates' ? [] : input.assets }, skip.signal, p => phases.push(p));
      if (outcome === 'skipped') skip.abort();
      const result = await pending;
      assert.equal(result.retrieval.outcome, outcome);
      assert.equal(calls.filter(c => c.url === '/api/vnext-help').length, 1);
      assert.equal(result.pack.meta.generationCalls, outcome === 'matched' ? 0 : 1);
      assert.equal(phases.at(-1), 'generating');
      if (outcome === 'timeout') assert(result.retrieval.waitMs >= 1450 && result.retrieval.waitMs < 2500);
      if (lateResolve) {
        lateResolve(Response.json({ version: 1, matches: [{ itemId: 'i1', assetId: 'a1', coverage: 'full' }], meta: { callCount: 1 } }));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(result.pack.items[0].kind, 'new');
        assert.equal(calls.length, 2);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});
