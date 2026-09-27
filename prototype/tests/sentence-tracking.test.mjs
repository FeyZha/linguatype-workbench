import assert from 'node:assert/strict';
import test from 'node:test';
import { findSentenceContaining, reconcileQuotedSentence, selectionIsInsideSentence } from '../app/sentence-tracking.ts';

const sentence = { text: 'A resolved sentence.', start: 10, end: 30 };

test('keeps sentence focus only while the selection remains inside it', () => {
  assert.equal(selectionIsInsideSentence(sentence, { start: 18, end: 18 }), true);
  assert.equal(selectionIsInsideSentence(sentence, { start: 10, end: 30 }), true);
  assert.equal(selectionIsInsideSentence(sentence, { start: 30, end: 30 }), true);
  assert.equal(selectionIsInsideSentence(sentence, { start: 31, end: 31 }), false);
  assert.equal(selectionIsInsideSentence(sentence, null), false);
});

test('locates a feedback quote in its source sentence', () => {
  const essay = 'First sentence. The awkward phrase appears here. Final sentence.';
  assert.equal(findSentenceContaining(essay, 'awkward phrase')?.text, 'The awkward phrase appears here.');
  assert.equal(findSentenceContaining(essay, 'missing quote'), null);
});

test('keeps a reviewed sentence anchored after the user rewrites it', () => {
  const before = 'First sentence. The awkward phrase appears here. Final sentence.';
  const after = 'First sentence. The clearer phrase appears here. Final sentence.';
  assert.equal(reconcileQuotedSentence(before, after, 'awkward phrase')?.text, 'The clearer phrase appears here.');
});
