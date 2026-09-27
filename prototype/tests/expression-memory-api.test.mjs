import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/scaffold/route.ts';

const input = {
  taskPrompt: 'How should cities reduce congestion?',
  fullEssay: 'Cities should 缓解交通拥堵.',
  targetSentence: 'Cities should 缓解交通拥堵.',
  memoryCandidates: [{ id: 'memory-1', chinese: '缓解交通拥堵', english: 'ease traffic congestion' }],
};

function providerOutput(memoryMatchIds) {
  return {
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({
      directExpressions: [{ itemId: 'i1', recommendedExpression: 'reduce road congestion' }],
      scaffoldSets: [],
      memoryMatchIds,
    }) } }] } }],
  };
}

test('the scaffold model may select only supplied memory IDs and never receives local counts', async () => {
  const previousFetch = globalThis.fetch;
  const previous = [process.env.BASE_URL, process.env.API_KEY, process.env.MODEL];
  process.env.BASE_URL = 'https://model.example'; process.env.API_KEY = 'test'; process.env.MODEL = 'test-model';
  let providerBody;
  globalThis.fetch = async (_url, init) => {
    providerBody = JSON.parse(init.body);
    return Response.json(providerOutput(['memory-1']));
  };
  try {
    const response = await POST(new Request('http://localhost/api/scaffold', { method: 'POST', body: JSON.stringify(input) }));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.memoryMatchIds, ['memory-1']);
    assert.equal(JSON.stringify(providerBody).includes('revealCount'), false);

    globalThis.fetch = async () => Response.json(providerOutput([]));
    const rejectedByContext = await POST(new Request('http://localhost/api/scaffold', { method: 'POST', body: JSON.stringify(input) }));
    assert.deepEqual((await rejectedByContext.json()).memoryMatchIds, []);

    globalThis.fetch = async () => Response.json(providerOutput(['invented-memory']));
    const invented = await POST(new Request('http://localhost/api/scaffold', { method: 'POST', body: JSON.stringify(input) }));
    assert.equal(invented.status, 200);
    const safeFallback = await invented.json();
    assert.deepEqual(safeFallback.memoryMatchIds, []);
    assert.equal(safeFallback.items.length, 1);

    const leakedCount = await POST(new Request('http://localhost/api/scaffold', { method: 'POST', body: JSON.stringify({ ...input, memoryCandidates: [{ ...input.memoryCandidates[0], revealCount: 9 }] }) }));
    assert.equal(leakedCount.status, 400);
  } finally {
    globalThis.fetch = previousFetch;
    [process.env.BASE_URL, process.env.API_KEY, process.env.MODEL] = previous;
  }
});
