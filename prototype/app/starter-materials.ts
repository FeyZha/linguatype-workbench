import { createEssayDocument, type PersistedWorkspace } from './workspace-state.ts';
import { completeWriting } from './writing-completion.ts';
import { EMPTY_ASSET_LIBRARY } from './language-assets.ts';
import { reasonText } from './reason-chains.ts';

// Add examples once; never rewrite existing essays, material revisions or writing history.
export function addStarterMaterials(workspace: PersistedWorkspace, examples: PersistedWorkspace): PersistedWorkspace {
  if (workspace.starterMaterialsLoaded) return workspace;
  const library = structuredClone(workspace.assetLibrary ?? EMPTY_ASSET_LIBRARY);
  library.ideas ??= []; library.reasons ??= [];
  const documents = [...workspace.documents], sources = new Map<string, { documentId: string; completionId: string }>();
  const now = new Date().toISOString();
  function sourceFor(id: string) {
    if (sources.has(id)) return sources.get(id)!;
    const original = examples.documents.find(d => d.documentId === id);
    if (!original) throw new Error('Missing example source');
    const documentId = crypto.randomUUID(), completionId = crypto.randomUUID();
    const doc = completeWriting(createEssayDocument(documentId, now, { taskPrompt: original.taskPrompt, essay: original.essay, promptSource: { kind: 'custom' } }), completionId, now);
    documents.push(doc); sources.set(id, { documentId, completionId });
    return { documentId, completionId };
  }
  for (const assets of [examples.assetLibrary?.assets ?? [], examples.assetLibrary?.ideas ?? [], examples.assetLibrary?.reasons ?? []]) {
    for (const original of assets) {
      if ('expression' in original && library.assets.some(a => a.expression === original.expression && a.meaningZh === original.meaningZh)
        || 'textZh' in original && library.ideas.some(a => a.textZh === original.textZh)
        || 'nodes' in original && library.reasons.some(a => reasonText(a) === reasonText(original))) continue;
      const source = sourceFor(original.sourceDocumentId);
      const asset = { ...structuredClone(original), assetId: crypto.randomUUID(), sourceDocumentId: source.documentId, sourceCompletionId: source.completionId };
      if ('expression' in asset) library.assets.push(asset);
      else if ('textZh' in asset) library.ideas.push(asset);
      else library.reasons.push(asset);
    }
  }
  return { ...workspace, documents, assetLibrary: library, starterMaterialsLoaded: true };
}
