import { useEffect, useRef, useState } from 'react';
import { DEMO_STEPS, PUBLIC_STORAGE_PREFIX } from './workspace';
import type { EssayDocument } from '../app/workspace-state';

function ResetDialog({ error, onClose, onReset }: { error: string; onClose: () => void; onReset: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => trigger?.focus(); }, []);
  return <dialog ref={ref} className="public-reset" role="alertdialog" aria-label="重置体验样例" onCancel={event => { event.preventDefault(); onClose(); }}><div><h2>重新开始这次体验？</h2><p>这会清除本体验版中的编辑与保存记录，恢复预置样例。</p>{error ? <p role="alert">{error}</p> : null}<div className="dialog-actions"><button className="btn btn-secondary" type="button" onClick={onClose} autoFocus>保留当前内容</button><button className="btn btn-primary" type="button" onClick={onReset}>确认重置</button></div></div></dialog>;
}

export function PublicDemoGuide({ documents, activeId, onSelect }: { documents: EssayDocument[]; activeId: string; onSelect: (id: string) => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState('');
  const step = DEMO_STEPS.find(s => s.id === activeId);
  const empty = new URLSearchParams(window.location.search).get('scene') === 'empty';
  function reset() {
    try {
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of Object.keys(storage)) if (key.startsWith(PUBLIC_STORAGE_PREFIX)) storage.removeItem(key);
      }
      window.location.reload();
    } catch { setError('浏览器未允许重置，请保留当前页面内容后重试。'); }
  }
  return <aside className="demo-guide public-demo-guide" aria-label="体验导航">
    <div className="public-demo-intro"><span className="public-demo-badge">可交互体验</span><strong>先写自己的，再用好写过的。</strong><p>内置合成样例与预置结果 · 无需登录 · 不调用模型 · 编辑只保存在此浏览器</p></div>
    <nav aria-label="体验步骤">{DEMO_STEPS.map(s => <button type="button" key={s.id} className={`btn ${s.id === activeId ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={s.id === activeId} disabled={!documents.some(d => d.documentId === s.id && d.status === 'active')} onClick={() => onSelect(s.id)}>{s.label}</button>)}</nav>
    <div className="public-demo-caption"><p aria-live="polite">{step?.hint ?? '这是预置旧文。你可以查看正文、编辑草稿，或切回上方体验场景。'}</p><div><a href={empty ? './' : '?scene=empty'}>{empty ? '返回有旧文的场景' : '体验没有旧文'}</a><button className="text-button" type="button" onClick={() => setResetOpen(true)}>重置样例</button></div></div>
    <details><summary>体验范围</summary><p>表达帮助支持预置公共服务草稿中的三处中文；全文审阅支持预置待审阅稿。旧文复用会核对已确认的原文，太空探索题返回空结果。你可以自由编辑并确认保存，刷新后仍保留；未收录的题目或改写稿不会产生新的审阅或复用结果。</p></details>
    {resetOpen ? <ResetDialog error={error} onClose={() => setResetOpen(false)} onReset={reset} /> : null}
  </aside>;
}
