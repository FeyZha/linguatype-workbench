import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const data = JSON.parse(readFileSync(new URL('../../docs/verification/simulated-learner-10-essays.json', import.meta.url), 'utf8'));
const demo = JSON.parse(readFileSync(new URL('../app/demo-simulated-learner.json', import.meta.url), 'utf8'));

test('simulated learner evidence keeps ten full essays, ordered actions and source-grounded saved data', () => {
  assert.equal(data.synthetic, true);
  assert.equal(data.executionTruth.actualBrowserAutomation, false);
  assert.equal(data.executionTruth.actualLocalApiCalls, true);
  assert.equal(data.executionTruth.successfulLocalModelCalls, 0);
  assert.equal(data.executionTruth.localApiProbe.resultUsedInSyntheticJourney, false);
  assert.equal(data.executionTruth.personalWorkspaceTouched, false);
  assert.equal(data.essays.length, 10);
  const events = data.essays.flatMap(essay => essay.events);
  assert.equal(events.length, 90);
  assert.equal(new Set(events.map(event => event.eventId)).size, 90);
  assert.equal(events.every(event => event.at && Number.isFinite(Date.parse(event.at)) && event.triggerReason && event.action && event.systemReturn && event.nextAction && event.channel), true);
  for (const essay of data.essays) {
    const initialWords = essay.initialDraft.trim().split(/\s+/).length;
    const finalWords = essay.finalDraft.trim().split(/\s+/).length;
    assert.equal(initialWords, essay.initialWordCount);
    assert.equal(finalWords, essay.finalWordCount);
    assert(initialWords >= 250 && initialWords <= 290);
    assert(finalWords >= 250 && finalWords <= 290);
  }
  assert.equal(data.embeddedWorkspace.argumentAssets.length, 5);
  assert.equal(data.embeddedWorkspace.argumentAssets.every(asset => asset.schemaVersion === 2), true);
  assert.equal(data.embeddedWorkspace.savedExpressions.length, 10);
  assert.equal(data.essays.filter(essay => essay.thoughtDecision.action === 'link').length, 2);
  assert.equal(data.essays.filter(essay => essay.thoughtDecision.action === 'skip').length, 2);
  assert.equal(data.essays.filter(essay => essay.thoughtDecision.action === 'empty').length, 1);
  const byDocument = new Map(data.essays.map(essay => [essay.documentId, essay]));
  for (const asset of data.embeddedWorkspace.argumentAssets) for (const source of asset.sources) {
    assert(byDocument.get(source.documentId)?.finalDraft.includes(source.quote));
  }
  for (const expression of data.embeddedWorkspace.savedExpressions) {
    assert.equal(expression.provenance.origin, 'simulated_revealed_expression_scaffold');
    assert(events.some(event => event.state === 'revealed_expression' && event.systemReturn?.saved?.some?.(saved => saved.expressionId === expression.expressionId)));
  }
  assert.equal(demo.synthetic, true);
  assert.equal(demo.schemaVersion, 2);
  assert.deepEqual(demo.documents.map(item => item.documentId), data.essays.map(item => item.documentId));
  assert.deepEqual(demo.argumentAssets, data.embeddedWorkspace.argumentAssets.map(({ synthetic, ...asset }) => asset));
  assert.equal(demo.favoriteExpressions.length, data.embeddedWorkspace.savedExpressions.length);
});
