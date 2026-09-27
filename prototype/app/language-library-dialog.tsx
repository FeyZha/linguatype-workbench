'use client';

import { useEffect, useRef, useState } from 'react';
import { ExposureBlock } from './vnext-help-panel';
import type { LanguageAsset, AssetLibrary } from './language-assets';
import { WorkspaceDataControls } from './workspace-data-controls';
import type { PersistedWorkspace } from './workspace-state';
import type { EssayDocument } from './workspace-state';

type AssetInput = Omit<LanguageAsset, 'revision' | 'createdAt' | 'updatedAt' | 'quality' | 'qualityReview'>;

export function LanguageLibraryDialog({ library, documents, activeDocumentId, saveError, qualityPending, onCheckQuality, onClose, onLoadSaved, onSave, onDelete, onShow, onReveal, onExport, onIncomplete, onReplace }: {
  onIncomplete?: () => void;
  qualityPending: { assetId: string; revision: number }[];
  onCheckQuality: (id: string) => void;
  saveError: boolean;
  library: AssetLibrary;
  documents: EssayDocument[];
  activeDocumentId: string;
  onClose: () => void;
  onLoadSaved: () => void;
  onSave: (value: AssetInput) => void;
  onDelete: (id: string) => void;
  onShow: (ids: string[]) => void;
  onReveal: (id: string, level: 'english' | 'source') => void;
  onExport: () => void;
  onReplace: (workspace: PersistedWorkspace | null) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LanguageAsset | 'new' | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const matches = library.assets.filter(a => a.meaningZh.includes(query.trim()));
  const shown = matches.slice(offset, offset + 3);
  const reported = useRef(new Set<string>());

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => trigger?.focus();
  }, []);

  function reveal(asset: LanguageAsset, level: 'english' | 'source') {
    const key = `${asset.assetId}:${asset.revision}:${level}`;
    setVisible(current => ({ ...current, [key]: true }));
  }
  function report(asset: LanguageAsset, level: 'chinese' | 'english' | 'source') {
    const key = `${asset.assetId}:${asset.revision}:${level}`;
    if (reported.current.has(key)) return;
    reported.current.add(key);
    if (level === 'chinese') onShow([asset.assetId]); else onReveal(asset.assetId, level);
  }
  function reportEditing(asset: LanguageAsset, level: 'english' | 'source') {
    const field = dialog.current?.querySelector<HTMLElement>(`[name="${level === 'english' ? 'expression' : 'sourceQuote'}"]`);
    if (!field || field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1) { onIncomplete?.(); return; }
    report(asset, level);
  }

  return (
    <dialog ref={dialog} className="language-library-dialog" aria-labelledby="language-library-title" onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className="dialog-header">
        <div className="field-row"><h2 id="language-library-title">我的语言素材</h2><button className="btn btn-secondary" onClick={onClose} type="button">返回写作</button></div>
        <p>留下自己用过的表达。仅保存在本设备；保存后由 AI 核对素材与来源，失败不影响保存。英文由你主动揭示。</p>
      </header>
      <div className="dialog-body material-body">
        {saveError ? <div role="alert"><p>本设备保存失败或另一窗口已更新数据。冲突副本会尽力保留在当前标签页，先导出可避免关闭标签页后丢失。</p><button type="button" className="btn btn-secondary" onClick={() => { onExport(); onLoadSaved(); }}>导出本窗口副本并载入已保存版本</button></div> : null}
        <div className="material-toolbar">
          <label>查找中文含义<input value={query} onChange={event => { setQuery(event.target.value); setVisible({}); setOffset(0); }} placeholder="例如：缓解交通拥堵" /></label>
          <button className="btn btn-primary" type="button" onClick={() => { setEditing('new'); setError(''); }}>添加语言素材</button>
          <button className="btn btn-secondary" type="button" onClick={onExport}>导出本设备数据</button>
        </div>
        <WorkspaceDataControls onReplace={onReplace} />
        {editing ? (
          <form className="material-form" key={editing === 'new' ? 'new' : editing.assetId} onSubmit={event => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            try {
              onSave({ assetId: editing === 'new' ? crypto.randomUUID() : editing.assetId, meaningZh: String(fields.get('meaningZh')), expression: String(fields.get('expression')), conditions: String(fields.get('conditions')), sourceDocumentId: String(fields.get('sourceDocumentId')), sourceQuote: String(fields.get('sourceQuote')) });
              setEditing(null); setError('');
            } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法保存。'); }
          }}>
            <h3>{editing === 'new' ? '确认一条值得留下的表达' : '编辑素材'}</h3>
            <label>中文含义<input name="meaningZh" required maxLength={160} defaultValue={editing === 'new' ? '' : editing.meaningZh} /></label>
            <ExposureBlock enabled onVisible={() => { if (editing !== 'new') reportEditing(editing, 'english'); }}><label>英文表达<input name="expression" required maxLength={240} defaultValue={editing === 'new' ? '' : editing.expression} /></label></ExposureBlock>
            <label>适用条件<input name="conditions" maxLength={400} defaultValue={editing === 'new' ? '' : editing.conditions} /></label>
            <label>来源作文<select name="sourceDocumentId" defaultValue={editing === 'new' ? activeDocumentId : editing.sourceDocumentId}>
              {editing !== 'new' && !documents.some(d => d.documentId === editing.sourceDocumentId) ? <option value={editing.sourceDocumentId}>原作文已删除（保留来源摘录）</option> : null}
              {documents.map(d => <option key={d.documentId} value={d.documentId}>{d.taskPrompt.slice(0,70) || '未命名作文'}</option>)}
            </select></label>
            <ExposureBlock enabled onVisible={() => { if (editing !== 'new') reportEditing(editing, 'source'); }}><label>来源片段<textarea name="sourceQuote" required maxLength={2000} rows={3} defaultValue={editing === 'new' ? '' : editing.sourceQuote} placeholder="从所选作文复制实际使用的句子" /></label></ExposureBlock>
            <label className="material-confirm"><input type="checkbox" required />我确认这是自己实际采用的表达。保存后会核对用法，保存不等于正确。</label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="dialog-actions"><button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>取消</button><button className="btn btn-primary" type="submit">确认保存</button></div>
          </form>
        ) : null}
        <div className="material-list">
          {!shown.length ? <p className="archive-empty">{query ? '没有匹配的中文含义。' : '还没有语言素材。先完成表达，再留下值得再次使用的一条。'}</p> : null}
          {shown.map(asset => (
            <article className="material-card" key={`${asset.assetId}:${asset.revision}`}>
              <ExposureBlock enabled onVisible={() => report(asset, 'chinese')}><h3>{asset.meaningZh}</h3></ExposureBlock>
              <p className="material-note">{qualityPending.some(q => q.assetId === asset.assetId && q.revision === asset.revision) ? '正在核对，保存不受影响' : asset.quality === 'usable' ? '用法核对通过 · 新句仍需另判断是否适用' : asset.quality === 'unreviewed' ? '尚未核对 · 不用于自动提醒' : '尚不能确认可用于提醒 · 可自行核对并编辑'}{documents.some(d => d.documentId === asset.sourceDocumentId) ? '' : ' · 原作文已删除，仅保留来源摘录'}</p>
              {asset.quality === 'unreviewed' ? <button className="btn btn-secondary" type="button" disabled={saveError || qualityPending.some(q => q.assetId === asset.assetId && q.revision === asset.revision)} onClick={() => onCheckQuality(asset.assetId)}>核对用法</button> : null}
              <button className="btn btn-secondary" type="button" onClick={() => reveal(asset, 'english')} aria-expanded={Boolean(visible[`${asset.assetId}:${asset.revision}:english`])}>查看英文</button>
              {visible[`${asset.assetId}:${asset.revision}:english`] ? <ExposureBlock enabled onVisible={() => report(asset, 'english')}><div className="material-expression"><strong>{asset.expression}</strong><p>{asset.conditions}</p></div></ExposureBlock> : null}
              <button className="btn btn-secondary" type="button" onClick={() => reveal(asset, 'source')} aria-expanded={Boolean(visible[`${asset.assetId}:${asset.revision}:source`])}>回看来源</button>
              {visible[`${asset.assetId}:${asset.revision}:source`] ? <ExposureBlock enabled onVisible={() => report(asset, 'source')}><blockquote>{asset.sourceQuote}</blockquote></ExposureBlock> : null}
              <div className="material-actions">
                <button className="btn btn-secondary" type="button" onClick={() => { reveal(asset,'english'); reveal(asset,'source'); setEditing(asset); setError(''); }}>编辑</button>
                <button className="btn btn-danger-ghost" type="button" onClick={() => setDeleting(asset.assetId)}>删除素材</button>
                {deleting === asset.assetId ? <span>同时移除素材提示记录及引用它的帮助包，作文保留。<button className="btn btn-secondary" type="button" onClick={() => setDeleting(null)}>取消</button><button className="btn btn-danger-ghost" type="button" onClick={() => { onDelete(asset.assetId); setDeleting(null); if(editing !== 'new' && editing?.assetId === asset.assetId) setEditing(null); }}>确认删除</button></span> : null}
              </div>
            </article>
          ))}
          {offset > 0 ? <button className="btn btn-secondary" type="button" onClick={() => { setVisible({}); setOffset(Math.max(0, offset - 3)); }}>上一页</button> : null}
          {matches.length > offset + 3 ? <button className="btn btn-secondary" type="button" onClick={() => { setVisible({}); setOffset(offset + 3); }}>下一页</button> : null}
        </div>
      </div>
    </dialog>
  );
}
