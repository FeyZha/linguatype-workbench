import assert from 'node:assert/strict';
import test from 'node:test';
import { readExtractionInput, readLanguageCandidates, readSelection, extractLanguage } from '../../evals/expression-scaffold/experiments/vnext-extraction.ts';

test('extraction rejects unsupported sources and duplicates without affecting completed text', () => {
  const input = readExtractionInput({ taskPrompt: 'Transport', completedEssay: 'Buses can ease congestion.', helpTargets: [], existingAssets: [] });
  const sources = readSelection({ choices: [{ expression: 'ease congestion', sourceQuote: input.completedEssay }] }, input);
  const candidate = { meaningZh: '缓解拥堵', choiceId: 'p0' };
  assert.equal(readLanguageCandidates({ candidates: [candidate] }, input, sources).candidates.length, 1);
  assert.equal(readLanguageCandidates({ candidates: [candidate] }, input, sources).candidates[0].reasonZh, '来自本篇完成稿，保存后可连同原句回看。');
  assert.match(readLanguageCandidates({ candidates: [candidate] }, input, sources).candidates[0].conditions, /仅供参照/);
  assert.equal(readLanguageCandidates({ candidates: [{ ...candidate, needsMore: 'false' }] }, input, sources).rejected, 1);
  assert.equal(readLanguageCandidates({ candidates: [{ ...candidate, reasonZh_note: 'unsolicited explanation' }] }, input, sources).rejected, 1);
  assert.equal(readLanguageCandidates({ candidates: [{ ...candidate, needsMore: true }] }, input, sources).rejected, 1);
  assert.equal(readLanguageCandidates({ candidates: [{ ...candidate, choiceId: 'invented' }] }, input, sources).rejected, 1);
  assert.equal(readLanguageCandidates({ candidates: [candidate] }, { ...input, existingAssets: [{ meaningZh: candidate.meaningZh, expression: 'ease congestion' }] }, sources).rejected, 1);
  assert.throws(() => readExtractionInput({ ...input, completedEssay: '' }));
  assert.throws(() => readExtractionInput({ ...input, expected: 'hidden test label' }));
  assert.equal(input.completedEssay, 'Buses can ease congestion.');
  assert.equal(sources[0].expression, 'ease congestion');
  assert.deepEqual(readSelection({ choices: [] }, input), []);
  assert.throws(() => readSelection({ choices: [{ expression: 'ease congestion', sourceQuote: 'Invented.' }] }, input));
  assert.throws(() => readSelection({ choices: [{ expression: 'congest', sourceQuote: input.completedEssay }] }, input));
  assert.throws(() => readSelection({ choices: [sources[0], sources[0]] }, input));
  const repeated = { ...input, completedEssay: 'Notebooks and books are useful.' };
  assert.equal(readSelection({ choices: [{ expression: 'books', sourceQuote: repeated.completedEssay }] }, repeated)[0].expression, 'books');
  assert.throws(() => readSelection({ choices: [{ expression: '.', sourceQuote: input.completedEssay }] }, input));
});


test('quoted selection preserves inflection, case and distinct units in one sentence', () => {
  const input = readExtractionInput({ taskPrompt: 'Work', completedEssay: 'Flexible work saves time by reducing travel.', helpTargets: [], existingAssets: [] });
  const quote = input.completedEssay;
  const selected = readSelection({ choices: [{ sourceQuote: quote, expression: 'saves time' }, { sourceQuote: quote, expression: 'reducing travel' }] }, input);
  assert.deepEqual(selected.map(s => s.expression), ['saves time', 'reducing travel']);
  for (const expression of ['save time', 'reduce travel', 'flexible work']) {
    assert.throws(() => readSelection({ choices: [{ sourceQuote: quote, expression }] }, input));
  }
});

test('source usage keeps open context without guessing semantic duplicates from shared words', () => {
  const input = readExtractionInput({ taskPrompt: 'Learning', completedEssay: 'Workers set aside time for reading. Parents set aside time for learning new skills. Volunteers remain committed to preserving public gardens.', helpTargets: [], existingAssets: [] });
  const selected = readSelection({ choices: [
    { expression: 'set aside time for reading', sourceQuote: 'Workers set aside time for reading.' },
    { expression: 'set aside time for learning new skills', sourceQuote: 'Parents set aside time for learning new skills.' },
    { expression: 'committed to', sourceQuote: 'Volunteers remain committed to preserving public gardens.' },
  ] }, input);
  const result = readLanguageCandidates({ candidates: selected.map((s, i) => ({ choiceId: s.choiceId, meaningZh: ['留出时间阅读', '留出时间学习新技能', '致力于'][i] })) }, input, selected);
  assert.equal(result.rejected, 0);
  assert.equal(result.candidates.length, 3);
  assert.match(result.candidates[2].sourceQuote, /preserving public gardens/);
  assert.doesNotMatch(result.candidates[2].conditions, /已完整|无需|不必|直接替换/);
  const different = { ...input, completedEssay: 'Work saves time. We save time by reducing commuting.' };
  const sources = readSelection({ choices: [{ expression: 'saves time', sourceQuote: 'Work saves time.' }, { expression: 'save time by reducing commuting', sourceQuote: 'We save time by reducing commuting.' }] }, different);
  assert.equal(readLanguageCandidates({ candidates: sources.map(s => ({ choiceId: s.choiceId, meaningZh: '节约时间' })) }, different, sources).candidates.length, 2);
});


test('each model task receives the context it needs and failures stay sanitized', async t => {
  const input = { taskPrompt: 'Leisure services', completedEssay: 'The council has upgraded sports facilities.', helpTargets: ['The council has 升级体育设施.'], existingAssets: [] };
  const selected = [{ choiceId: 'p0', expression: 'upgraded sports facilities', sourceQuote: input.completedEssay }];
  const keys = ['base_url', 'api_key', 'model', 'provider'];
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { base_url: 'https://test.invalid', api_key: 'test-only', model: 'test', provider: 'openai_compatible' });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const sent = JSON.parse(JSON.parse(options.body).messages[1].content);
    requests++;
    assert.equal(requests, 1);
    assert.deepEqual(sent, { ...input, selected });
    const output = { candidates: [{ choiceId: 'p0', meaningZh: '升级了体育设施' }] };
    const call = { function: { name: 'return_language_candidates', arguments: JSON.stringify(output) } };
    return Response.json({ choices: [{ message: { tool_calls: [call] }, finish_reason: 'tool_calls' }] });
  });
  try {
    const result = await extractLanguage(input, { choices: selected.map(({ expression, sourceQuote }) => ({ expression, sourceQuote })) });
    assert.equal(result.meta.callCount, 1);
    assert.equal(result.candidates[0].expression, 'upgraded sports facilities');
    t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private transport detail'); });
    await assert.rejects(extractLanguage(input, { choices: selected }), e => e.message === 'MODEL_TRANSPORT_FAILED' && e.trace.callCount === 1 && !JSON.stringify(e.trace).includes('test-only'));
  } finally {
    keys.forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]);
  }
});

