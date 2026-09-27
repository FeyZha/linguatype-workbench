// Synthetic protocol fixtures only; never imported by the UI or persisted to a workspace.
export const normalInput = {
  documentId: 'synthetic-deposit-regression',
  taskPrompt: 'Should learners receive feedback during a course?',
  snapshot: 'Feedback received only at the end cannot change the work already done. Small reports expose errors while people can still adjust their actions. Readers need time to respond. Reports should focus on one recurring problem. Extra numbers alone cannot guide improvements.',
  existingExpressions: [],
};
export const normalOutput = {
  thoughts: [{ thought: '反馈应在行动仍可调整时到达，而不只是记录最终结果。', useWhen: '当反馈只在过程结束后才给出时', rationale: '过程中的反馈能让人及时发现并纠正偏差。', limits: [], sourceIndexes: [1, 2] }],
  languageExpressions: [{ expression: 'focus on sth', meaningZh: '聚焦某事', pattern: 'focus on + 对象', usageScope: null, sourceForm: 'focus on one recurring problem', sourceIndex: 4 }],
};
export const emptyOutput = { thoughts: [], languageExpressions: [] };
export const emptyInput = { documentId: 'synthetic-empty-deposit', taskPrompt: 'Describe this library.', snapshot: 'The library opens at nine. It has two floors.', existingExpressions: [] };
