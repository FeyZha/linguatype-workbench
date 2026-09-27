import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { extractTopicAsset, DEPOSIT_PROMPT } from '../app/server/topic-deposit.ts';
import { DEPOSIT_PROMPT_VERSION } from '../app/topic-assets.ts';
import { findSentences } from '../app/sentence-tracking.ts';
import { normalInput, normalOutput, emptyInput, emptyOutput } from './fixtures/thought-deposit.mjs';

// Exercise the real HTTP handler without starting a server. Only resolve its relative import
// before Node's built-in TS stripping; the response/error-handling body is unchanged.
const routePath = new URL('../app/api/deposit/route.ts', import.meta.url);
const routeSource = readFileSync(routePath, 'utf8').replace("from '../../server/topic-deposit'", `from '${new URL('../app/server/topic-deposit.ts', import.meta.url).href}'`);
const { POST } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(routeSource)).toString('base64'));

async function withModel(output, fn) {
  const names = ['base_url', 'api_key', 'model', 'provider'];
  const old = Object.fromEntries(names.map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
  Object.assign(process.env, { base_url:'https://test.invalid', api_key:'synthetic-not-a-secret', model:'synthetic-test-model', provider:'deepseek' });
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body); requests.push(request);
    return Response.json({ choices:[{ message:{ tool_calls:[{ function:{ name:request.tool_choice.function.name, arguments:JSON.stringify(output) } }] } }] });
  };
  try { return await fn(requests); }
  finally { globalThis.fetch = oldFetch; for(const k of names) if(old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }
}
const thoughtOnly = () => ({ thoughts: structuredClone(normalOutput.thoughts), languageExpressions: [] });

test('complete normal fixture preserves all evidence and a valid independent expression', async () => {
  await withModel(normalOutput, async requests => {
    const result = await extractTopicAsset(normalInput);
    assert.equal(requests.length, 1);
    assert.equal(result.meta.promptVersion, DEPOSIT_PROMPT_VERSION);
    assert.equal(result.candidate.thought.thought, normalOutput.thoughts[0].thought);
    assert.deepEqual(result.candidate.thought.sourceQuotes, findSentences(normalInput.snapshot).slice(0, 2).map(s => s.text));
    assert.equal(result.candidate.languageExpressions.length, 1);
    assert.equal(result.candidate.languageExpressions[0].sourceQuote, findSentences(normalInput.snapshot)[3].text);
    assert.equal(Object.hasOwn(result.candidate.languageExpressions[0], 'sourceIndex'), false);
  });
});

test('complete empty fixture stays a valid empty result, not a fabricated asset', async () => {
  await withModel(emptyOutput, async requests => {
    const result = await extractTopicAsset(emptyInput);
    assert.equal(requests.length, 1);
    assert.equal(result.candidate.thought, null);
    assert.deepEqual(result.candidate.languageExpressions, []);
  });
});

test('explicit judgment with null rationale is accepted without filling in a reason', async () => {
  const output = thoughtOnly(); output.thoughts[0].rationale = null;
  await withModel(output, async () => assert.equal((await extractTopicAsset(normalInput)).candidate.thought.rationale, null));
});

test('exact four-index boundary and six limits are accepted without projection loss', async () => {
  const output = thoughtOnly(); output.thoughts[0].sourceIndexes = [1, 2, 3, 4]; output.thoughts[0].limits = Array.from({length:6}, (_, i) => `合成边界${i + 1}`);
  await withModel(output, async () => {
    const result = await extractTopicAsset(normalInput);
    assert.equal(result.candidate.thought.sourceQuotes.length, 4);
    assert.equal(result.candidate.thought.limits.length, 6);
  });
});

const invalid = [
 ['null root', () => null], ['array root', () => []],
 ['missing thoughts', o => { delete o.thoughts; return o; }],
 ['missing language expressions', o => { delete o.languageExpressions; return o; }],
 ['extra top-level field', o => ({...o, analysis:'not allowed'})],
 ['thoughts not an array', o => ({...o, thoughts:{}})],
 ['two thoughts', o => ({...o, thoughts:[...o.thoughts, ...o.thoughts]})],
 ['null thought', o => ({...o, thoughts:[null]})],
 ['primitive thought', o => ({...o, thoughts:['not an object']})],
 ['extra thought field', o => { o.thoughts[0].sourceQuotes=['invented']; return o; }],
 ['missing rationale', o => { delete o.thoughts[0].rationale; return o; }],
 ['empty useWhen', o => { o.thoughts[0].useWhen=' '; return o; }],
 ['non-string thought', o => { o.thoughts[0].thought=42; return o; }],
 ['non-null non-string rationale', o => { o.thoughts[0].rationale=false; return o; }],
 ['seven limits', o => { o.thoughts[0].limits=Array(7).fill('合成边界'); return o; }],
 ['non-string limit', o => { o.thoughts[0].limits=[3]; return o; }],
 ['no source indexes', o => { o.thoughts[0].sourceIndexes=[]; return o; }],
 ['five source indexes', o => { o.thoughts[0].sourceIndexes=[1,2,3,4,5]; return o; }],
 ['duplicate source index', o => { o.thoughts[0].sourceIndexes=[1,1]; return o; }],
 ...[['string', '1'],['boolean',true],['null',null],['fractional',1.5],['zero',0],['negative',-1],['out-of-range',6]].map(([name, value]) => [`${name} source index`, o => { o.thoughts[0].sourceIndexes=[value]; return o; }]),
 ['expressions not an array', o => ({...o, languageExpressions:{}})],
 ['six expressions', o => ({...o, languageExpressions:Array(6).fill(normalOutput.languageExpressions[0])})],
 ['null expression', o => ({...o, languageExpressions:[null]})],
 ['extra expression field', o => ({...o, languageExpressions:[{...normalOutput.languageExpressions[0], sourceQuote:'invented'}]})],
 ['missing expression source index', o => { const e={...normalOutput.languageExpressions[0]}; delete e.sourceIndex; o.languageExpressions=[e]; return o; }],
 ['string expression source index', o => ({...o, languageExpressions:[{...normalOutput.languageExpressions[0],sourceIndex:'4'}]})],
 ['out-of-range expression source index', o => ({...o, languageExpressions:[{...normalOutput.languageExpressions[0],sourceIndex:6}]})],
 ['non-string expression meaning', o => ({...o, languageExpressions:[{...normalOutput.languageExpressions[0],meaningZh:42}]})],
];
for (const [name, mutate] of invalid) test(`reject before normalization: ${name}`, async () => {
  await withModel(mutate(thoughtOnly()), async requests => {
    await assert.rejects(extractTopicAsset(normalInput), { message:'MODEL_RESPONSE_INVALID' });
    assert.equal(requests.length,1,'No automatic extra call to hide a raw contract failure');
  });
});

test('language quality filtering and existing-expression de-duplication remain separate from raw protocol rejection', async () => {
  await withModel(normalOutput, async () => {
    const result = await extractTopicAsset({...normalInput, existingExpressions:['focus on sth']});
    assert.deepEqual(result.candidate.languageExpressions, []);
    assert.ok(result.candidate.thought);
  });
  const lowValue = { ...normalOutput, languageExpressions:[{ ...normalOutput.languageExpressions[0], expression:'go to school' }] };
  await withModel(lowValue, async () => assert.deepEqual((await extractTopicAsset(normalInput)).candidate.languageExpressions, []));
});

test('empty thoughts do not suppress a valid independent expression', async () => {
  await withModel({...normalOutput,thoughts:[]}, async () => {
    const result=await extractTopicAsset(normalInput);
    assert.equal(result.candidate.thought,null);
    assert.equal(result.candidate.languageExpressions.length,1);
  });
});

test('HTTP handler returns 502 without raw model data or a success candidate on overflow', async () => {
  const output = thoughtOnly(); output.thoughts[0].sourceIndexes=[1,2,3,4,5];
  await withModel(output, async () => {
    const response = await POST(new Request('https://test.invalid/api/deposit',{method:'POST',body:JSON.stringify(normalInput)}));
    assert.equal(response.status,502);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(), {version:1,error:'DEPOSIT_UNAVAILABLE'});
  });
});

test('HTTP handler still accepts empty output and rejects malformed user input with 400', async () => {
  await withModel(emptyOutput, async requests => {
    const ok = await POST(new Request('https://test.invalid/api/deposit',{method:'POST',body:JSON.stringify(emptyInput)}));
    assert.equal(ok.status,200); assert.equal((await ok.json()).candidate.thought,null);
    const bad = await POST(new Request('https://test.invalid/api/deposit',{method:'POST',body:'{'}));
    assert.equal(bad.status,400); assert.equal(requests.length,1);
  });
});

test('prompt revision keeps optional rationale and bounded-selection instructions explicit', () => {
  assert.equal(DEPOSIT_PROMPT_VERSION, 'thought-asset-extraction-v5-bounded-supported-judgment');
  assert.ok(DEPOSIT_PROMPT.includes('不得仅因缺少理由而丢弃'));
  assert.ok(DEPOSIT_PROMPT.includes('最多1条'));
  assert.ok(DEPOSIT_PROMPT.includes('最多4个'));
});
