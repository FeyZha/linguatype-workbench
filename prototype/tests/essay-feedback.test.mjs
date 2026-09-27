import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackProblemText, groupFeedbackSuggestions, placeFeedbackNotes } from '../app/essay-feedback.ts';

test('groups feedback attached to the same sentence', () => {
  assert.deepEqual(groupFeedbackSuggestions(['10:40', '10:40', '80:120', '']), [
    { key: '10:40', indexes: [0, 1] },
    { key: '80:120', indexes: [2] },
    { key: 'suggestion:3', indexes: [3] },
  ]);
});

test('separates a leading English quote from the Chinese problem', () => {
  assert.equal(feedbackProblemText('more relaxing than reading 把两种感受混在了一起'), '把两种感受混在了一起');
  assert.equal(feedbackProblemText('表达略显笼统'), '表达略显笼统');
});

test('stacks anchored feedback notes without overlap or viewport overflow', () => {
  assert.deepEqual(placeFeedbackNotes([100, 130, 400], [80, 90, 50], 800), [100, 192, 400]);
  assert.deepEqual(placeFeedbackNotes([700, 730], [100, 100], 800), [572, 684]);
  assert.deepEqual(placeFeedbackNotes([700, 730], [100, 100], 630), [402, 514]); // Leave room below for the floating actions.
});
