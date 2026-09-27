'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sourceParts, type WritingCompletion, type CompletionCandidate } from './writing-completion';
import { ExposureBlock } from './vnext-help-panel';

export function WritingCompletionPanel({ completions, selectedId, saved, onSelect, onAnalyze, onSave, onIgnore, onClose, usagePanel, ideaPanel, reasonPanel, onExposure }: {
  onExposure?: (key: string, content: string, level: 'chinese' | 'english') => void;
  usagePanel?: ReactNode;
  ideaPanel?: ReactNode;
  reasonPanel?: ReactNode;
  completions: WritingCompletion[];
  selectedId: string;
  saved: boolean;
  onSelect: (id: string) => void;
  onAnalyze: (completion: WritingCompletion) => void;
  onSave: (index: number, value: CompletionCandidate) => void;
  onIgnore: (index: number) => void;
  onClose: () => void;
}) {
  const completion = completions.find(c => c.completionId === selectedId);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  if (!completion) return null;
  return <dialog ref={dialog} className="completion-panel" aria-labelledby="completion-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="field-row"><h2 id="completion-title">本次写作已完成</h2><button className="btn btn-secondary" type="button" onClick={onClose}>返回写作</button></div>
    <p>{saved ? '完成稿已保存在本设备。整理可以跳过，正文仍可继续编辑。' : '完成稿尚未确认保存。保存成功后才可开始整理；保存失败时请先导出备份。'}</p>
    <label>查看完成版本<select value={completion.completionId} onChange={e => { setError(''); onSelect(e.target.value); }}>{completions.map((c, i) => <option key={c.completionId} value={c.completionId}>第 {i + 1} 版 · {new Date(c.completedAt).toLocaleString('zh-CN')}</option>)}</select></label>
    <details><summary>查看这次的题目和完成稿</summary><p>{completion.taskPrompt}</p><ExposureBlock enabled onVisible={() => onExposure?.('completed-essay', completion.essay, 'english')}><div className="completion-source">{completion.essay}</div></ExposureBlock></details>
    {usagePanel}
    {completion.status === 'idle' || completion.status === 'error' ? <div className="completion-actions">
      {completion.status === 'error' ? <p role="alert">上次整理未完成，作文不受影响。可重试，也可稍后回来。</p> : <p>从实际完成稿中挑选少量语言表达，由你决定是否保存。</p>}
      <button className="btn btn-primary" type="button" disabled={!saved} onClick={() => onAnalyze(completion)}>{completion.status === 'error' ? '重新提炼候选' : '提炼语言候选'}</button>
      <button className="btn btn-secondary" type="button" onClick={onClose}>稍后整理</button>
    </div> : null}
    {completion.status === 'loading' ? <p role="status">正在整理这份完成稿。可以返回写作，结果会保留在这个版本，不会改动正文。</p> : null}
    {completion.status === 'ready' && !completion.candidates.length ? <p>本次没有新的合适候选。完成稿已保留，不必为了收藏凑数。</p> : null}
    {completion.candidates.map((candidate, index) => <article className="material-card" key={`${completion.completionId}:${index}`}>
      <ExposureBlock enabled onVisible={() => onExposure?.(`candidate-meaning:${index}`, candidate.meaningZh, 'chinese')}><h3>{candidate.meaningZh}</h3></ExposureBlock>
      <ExposureBlock enabled onVisible={() => onExposure?.(`candidate-expression:${index}`, candidate.expression, 'english')}><p className="completion-expression">{candidate.expression}</p></ExposureBlock>
      <p>{candidate.reasonZh}</p>
      <p className="material-note">原句接法 · {candidate.conditions}</p>
      <ExposureBlock enabled onVisible={() => onExposure?.(`candidate-source:${index}`, candidate.sourceQuote, 'english')}><blockquote className="completion-source">{sourceParts(candidate.sourceQuote, candidate.expression).map((part, i) => part.highlighted ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</blockquote></ExposureBlock>
      {candidate.decision === 'pending' ? <form onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        try { onSave(index, { ...candidate, meaningZh: String(fields.get('meaningZh')), expression: String(fields.get('expression')), conditions: String(fields.get('conditions')) }); setError(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法保存。'); }
      }}>
        <details><summary>编辑后再保存</summary>
          <label>中文含义<input name="meaningZh" defaultValue={candidate.meaningZh} required maxLength={160} /></label>
          <label>英文表达<input name="expression" defaultValue={candidate.expression} required maxLength={240} /></label>
          <label>使用参照<input name="conditions" defaultValue={candidate.conditions} maxLength={400} /></label>
        </details>
        <p className="material-note">保存后会由 AI 核对素材与来源；结果可在素材库查看，失败不影响保存。用于新句时仍需核对。</p>
        <div className="completion-actions"><button className="btn btn-primary" type="submit" disabled={!saved}>保存这条</button><button className="btn btn-secondary" type="button" disabled={!saved} onClick={() => onIgnore(index)}>忽略</button></div>
      </form> : <p role="status">{candidate.decision === 'saved' ? '已保存到语言素材（含你的修订）；这里保留原始候选，便于回看。' : '已忽略，不进入语言素材。'}</p>}
    </article>)}
    {ideaPanel}
    {reasonPanel}
    {error ? <p role="alert">{error}</p> : null}
  </dialog>;
}
