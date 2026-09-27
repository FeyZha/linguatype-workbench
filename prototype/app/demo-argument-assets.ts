import type { TopicAssetPack } from './topic-assets.ts';
import type { ArgumentAsset, ArgumentAssetUsage } from './argument-assets.ts';

export function createDemoArgumentAssetState(packs: TopicAssetPack[]) {
  const assets: ArgumentAsset[] = packs.flatMap((pack, index) => {
    if (pack.schemaVersion !== 3 || !pack.thought) return [];
    return [{
      assetId: `demo-argument-asset-${index + 1}`,
      kind: 'thought' as const,
      thought: pack.thought.thought,
      ...(pack.thought.useWhen ? { useWhen: pack.thought.useWhen } : {}),
      ...(pack.thought.rationale ? { rationale: pack.thought.rationale } : {}),
      ...(pack.thought.limits.length ? { limits: pack.thought.limits } : {}),
      sources: pack.thought.sourceQuotes.map(quote => ({ documentId: pack.sourceDocumentId, revisionId: pack.completion?.versionId ?? `pack:${pack.id}:r${pack.revision}`, sourceTitle: pack.sourceTitle, taskPrompt: pack.sourcePrompt, quote })),
      status: 'active' as const,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
      usageCount: 0,
    }];
  });
  return { assets: structuredClone(assets), usages: [] as ArgumentAssetUsage[] };
}
