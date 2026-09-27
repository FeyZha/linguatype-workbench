import data from './demo-learner-themes.json' with { type: 'json' };
import { createEssayDocument, isPersistedWorkspace, type PersistedWorkspace } from './workspace-state.ts';

export const LEARNER_THEMES = data.themes;
export const LEARNER_THEME_ESSAYS = data.sourceEssays;
export const LEARNER_THEME_CASES = data.cases;

/** Frozen real extraction + synthetic role decisions; only loaded in ?demo=learner25. */
export function createLearnerThemesWorkspace(): PersistedWorkspace {
  const workspace: unknown = structuredClone(data.workspace);
  if (!data.synthetic || !isPersistedWorkspace(workspace)) throw new Error('INVALID_LEARNER_THEMES_DEMO');
  const documents = LEARNER_THEME_CASES.map(item => createEssayDocument(item.documentId, workspace.savedAt, { taskPrompt: item.taskPrompt, essay: '', promptSource: { kind: 'custom' } }));
  return { ...workspace, documents: [...documents, ...workspace.documents], activeDocumentId: documents[0].documentId };
}
