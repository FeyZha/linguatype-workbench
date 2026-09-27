import { useEffect, useRef, useState } from 'react';
import { readRecallIds } from './prewriting-recall';
import type { ContentAsset } from './idea-usage';
export function useMaterialRecall(kind: 'idea' | 'reason', taskPrompt: string, assets: ContentAsset[], initialRecall = false) {
  const [related, setRelated] = useState<string[] | null>(initialRecall ? [] : null);
  const [recallStatus, setRecallStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function recall() {
    if (request.current || !taskPrompt.trim()) return;
    setRelated([]); setRecallStatus('loading');
    const controller = new AbortController(); request.current = controller;
    try {
      // ponytail: one call covers at most 100 eligible entries; manual search remains available above the cap.
      const input = { taskPrompt, assets: assets.filter(a => a.quality === 'usable' && a.qualityReview?.revision === a.revision) };
      if (input.assets.length > 100) throw new Error('TOO_MANY');
      if (!input.assets.length) { setRecallStatus('ready'); return; }
      const response = await fetch('/api/' + kind + '-recall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) });
      if (!response.ok) throw new Error('FAILED');
      const value = await response.json();
      if (!value || value.version !== 1 || Object.keys(value).length !== 3 || value.meta?.callCount !== 1 || !Array.isArray(value.result)) throw new Error('INVALID_OUTPUT');
      const selected = readRecallIds({ assetIds: value.result.map((a: { assetId: string }) => a?.assetId) }, input.assets);
      if (value.result.some((a: { revision: number }, i: number) => Object.keys(a).length !== 2 || a.revision !== selected[i].revision)) throw new Error('INVALID_OUTPUT');
      if (!controller.signal.aborted) { setRelated(selected.map(a => a.assetId)); setRecallStatus('ready'); }
    } catch { if (!controller.signal.aborted) setRecallStatus('error'); }
    finally { if (request.current === controller) request.current = null; }
  }
  function showAll() { request.current?.abort(); request.current = null; setRelated(null); setRecallStatus('idle'); }
  return { related, recallStatus, recall, showAll };
}
