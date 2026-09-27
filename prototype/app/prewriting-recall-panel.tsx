'use client';

import { useEffect, useRef, useState } from 'react';
import { ExposureBlock } from './vnext-help-panel';
import { readRecallSelection, type RecallInput, type RecallSelection } from './prewriting-recall';

// The parent keys this panel by document, topic and eligible asset revisions.
export function PrewritingRecallPanel({ input, enabled, onRequest, onExposure, onIncomplete, onWrite }: {
  input: RecallInput; enabled: boolean; onRequest: () => void;
  onExposure: (id: string, level: 'chinese' | 'english' | 'source') => void;
  onIncomplete: () => void; onWrite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selected, setSelected] = useState<RecallSelection[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const reported = useRef(new Set<string>());
  useEffect(() => () => request.current?.abort(), []);

  async function recall() {
    if (!enabled || request.current) return;
    setOpen(true);
    if (status === 'ready') return;
    onRequest();
    if (!input.assets.length) { setSelected([]); setStatus('ready'); return; }
    const controller = new AbortController(); request.current = controller;
    setStatus('loading');
    try {
      const response = await fetch('/api/prewriting-recall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) });
      if (!response.ok) throw new Error('FAILED');
      const body = await response.json();
      if (body?.version !== 1 || Object.keys(body).length !== 3 || !Array.isArray(body.selected) || !body.meta || ![0, 1].includes(body.meta.callCount)) throw new Error('INVALID_OUTPUT');
      const checked = readRecallSelection({ assetIds: body.selected.map((a: RecallSelection) => a?.assetId) }, input);
      if (body.selected.some((a: RecallSelection, i: number) => !a || Object.keys(a).length !== 2 || a.revision !== checked[i].revision)) throw new Error('INVALID_OUTPUT');
      if (controller.signal.aborted) return;
      setSelected(checked); setStatus('ready');
    } catch { if (!controller.signal.aborted) setStatus('error'); }
    finally { if (request.current === controller) request.current = null; }
  }
  function close() {
    request.current?.abort(); request.current = null;
    if (status === 'loading') setStatus('idle');
    setOpen(false); onWrite();
  }
  function expose(id: string, level: 'chinese' | 'english' | 'source') {
    const key = `${id}:${level}`;
    if (reported.current.has(key)) return;
    reported.current.add(key); onExposure(id, level);
  }
  return <section className="prewriting-recall" aria-label="写前回想">
    <div className="field-row">
      <button type="button" className="btn btn-secondary" disabled={!enabled || status === 'loading'} aria-expanded={open} onClick={() => void recall()}>回想旧表达（可跳过）</button>
      <button type="button" className="btn btn-secondary" onClick={close}>直接写作</button>
    </div>
    {open ? <div className="prewriting-content">
      <p className="material-note">先看中文回想，最多 3 条。是否适合本次想法，由你决定；开始写正文后自动收起。</p>
      {status === 'loading' ? <p role="status">正在找相关旧表达，可以直接开始写。</p> : null}
      {status === 'error' ? <p role="alert">暂时没能取得提醒。可以重试，也可以直接写作。</p> : null}
      {status === 'ready' && !selected.length ? <p>{input.assets.length ? '没有找到足够相关的旧表达，直接开始写吧。' : '还没有已核对可用的语言素材，直接开始写吧。'}</p> : null}
      {status === 'ready' ? selected.map(({ assetId }) => {
        const asset = input.assets.find(a => a.assetId === assetId)!;
        return <article className="result-card" key={assetId}>
          <ExposureBlock enabled={open} fullyVisible onPartial={onIncomplete} onVisible={() => expose(assetId, 'chinese')}><p>{asset.meaningZh}</p></ExposureBlock>
          <button type="button" className="btn btn-secondary" aria-expanded={revealed.includes(assetId)} onClick={() => setRevealed(v => v.includes(assetId) ? v : [...v, assetId])}>{revealed.includes(assetId) ? '已显示英文' : '显示英文'}</button>
          {revealed.includes(assetId) ? <>
            <ExposureBlock enabled={open} fullyVisible onPartial={onIncomplete} onVisible={() => expose(assetId, 'english')}><strong>{asset.expression}</strong><p>{asset.conditions}</p></ExposureBlock>
            <ExposureBlock enabled={open} fullyVisible onPartial={onIncomplete} onVisible={() => expose(assetId, 'source')}><blockquote>{asset.sourceQuote}</blockquote></ExposureBlock>
          </> : null}
        </article>;
      }) : null}
    </div> : null}
  </section>;
}
