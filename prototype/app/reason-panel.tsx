'use client';
import { useMaterialRecall } from './use-material-recall';
import { useEffect, useRef, useState } from 'react';
import { reasonText, reasonRelations, type ReasonAsset, type ReasonCandidate } from './reason-chains';
import { ExposureBlock } from './vnext-help-panel';
import type { WritingCompletion } from './writing-completion';
type ExposureProps = { onExposure: (key: string, text: string, level: 'chinese' | 'english', asset?: ReasonAsset) => void; onIncomplete: () => void };
function ReasonDisplay({ candidate, id, asset, onExposure, onIncomplete }: ExposureProps & { candidate: ReasonCandidate; id: string; asset?: ReasonAsset }) {
  return <><ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure(id + ':content', reasonText(candidate), 'chinese', asset)}><ol>{candidate.nodes.map((node, i) => <li key={i}>{i ? <strong>{reasonRelations[candidate.links[i - 1].relation]}：</strong> : null}{node.textZh}</li>)}</ol></ExposureBlock>
    <details><summary>逐步核对来源</summary>{candidate.nodes.map((n, i) => <div key={i}><p>节点 {i + 1} 的来源</p><ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure(id + ':node:' + i, n.sourceQuote, 'english', asset)}><blockquote>{n.sourceQuote}</blockquote></ExposureBlock>{i ? <><p>第 {i} → {i + 1} 步关系的来源</p><ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure(id + ':link:' + i, candidate.links[i - 1].sourceQuote, 'english', asset)}><blockquote>{candidate.links[i - 1].sourceQuote}</blockquote></ExposureBlock></> : null}</div>)}</details>
  </>;
}
function ReasonEditor({ candidate, saved, label, onSave, onIncomplete }: { candidate: ReasonCandidate; saved: boolean; label: string; onSave: (value: ReasonCandidate) => void; onIncomplete: () => void }) {
  const [error, setError] = useState('');
  return <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { onSave({ nodes: candidate.nodes.map((n, i) => ({ ...n, textZh: String(data.get('node-' + i)) })), links: candidate.links.map((l, i) => ({ ...l, relation: String(data.get('link-' + i)) as keyof typeof reasonRelations })) }); setError(''); } catch { setError('请保留有效中文节点与对应关系和来源；已有相同条目时无需重复保存。'); } }}>
    <details onToggle={e => { if (e.currentTarget.open) onIncomplete(); }}><summary>编辑节点与关系</summary>{candidate.nodes.map((n, i) => <div key={i}><label>节点 {i + 1}<textarea name={'node-' + i} defaultValue={n.textZh} maxLength={200} required /></label>{i ? <label>第 {i} → {i + 1} 步关系<select name={'link-' + (i - 1)} defaultValue={candidate.links[i - 1].relation}><option value="cause">前者促成后者</option><option value="support">前者支持后者主张</option><option value="condition">原文提出的条件场景</option></select></label> : null}</div>)}</details>
    <p className="material-note">保存或修订后核对原文关系；不相符、未核对或未知的链不参与推荐。</p><button type="submit" className="btn btn-primary" disabled={!saved}>{label}</button>{error ? <p role="alert">{error}</p> : null}
  </form>;
}
export function ReasonExtractionPanel({ completion, saved, onAnalyze, onDecide, onExposure, onIncomplete }: ExposureProps & { completion: WritingCompletion; saved: boolean; onAnalyze: () => void; onDecide: (index: number, value?: ReasonCandidate) => void }) {
  const analysis = completion.reasons;
  return <section className="idea-panel" aria-label="保存本次理由链"><h3>保存本次理由链</h3><p>只保留原稿中的短推理：起点、后续结果和每一步的来源。不补缺失理由，也不代表现实事实已证实。</p>
    {!analysis || analysis.status === 'error' ? <><button type="button" className="btn btn-secondary" disabled={!saved} onClick={onAnalyze}>{analysis ? '重试提炼理由链' : '提炼理由链候选'}</button>{analysis ? <p role="alert">上次未完成，作文保留，可以重试或稍后整理。</p> : null}</> : null}
    {analysis?.status === 'loading' ? <p role="status">正在核对原稿的节点和关系，可以返回写作。</p> : null}
    {analysis?.status === 'ready' && !analysis.candidates.length ? <p>没有新的合适短理由链，不补推理凑数。</p> : null}
    {analysis?.candidates.map((c, i) => <article className="material-card" key={i}><h4>理由链 {i + 1}</h4><ReasonDisplay candidate={c} id={'reason-candidate:' + i} onExposure={onExposure} onIncomplete={onIncomplete} /><p>保留理由：这些节点及连接可逐步回到原稿核对；用于新题仍需另行判断。</p>
      {c.decision === 'pending' ? <><ReasonEditor candidate={c} saved={saved} label="保存理由链" onSave={value => onDecide(i, value)} onIncomplete={onIncomplete} /><button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => onDecide(i)}>忽略理由链</button></> : <p>{c.decision === 'saved' ? '已保存；这里保留原始候选，修订请到理由链素材查看。' : '已忽略，不进入素材库。'}</p>}
    </article>)}
  </section>;
}
export function ReasonLibraryDialog({ assets, taskPrompt, initialRecall = false, saved, pending, sourceAvailable, onClose, onSave, onDelete, onCheck, onExposure, onIncomplete }: ExposureProps & {
  assets: ReasonAsset[]; taskPrompt: string; initialRecall?: boolean; saved: boolean; pending: { assetId: string; revision: number }[]; sourceAvailable: (asset: ReasonAsset) => boolean;
  onClose: () => void; onSave: (asset: ReasonAsset, value: ReasonCandidate) => void; onDelete: (id: string) => void; onCheck: (asset: ReasonAsset) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), reported = useRef(new Set<string>());
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => trigger?.focus(); }, []);
  const { related, recallStatus, recall, showAll } = useMaterialRecall('reason', taskPrompt, assets, initialRecall);
  const shown = assets.filter(a => (related === null || related.includes(a.assetId)) && reasonText(a).includes(query.trim()));
  const expose: ExposureProps['onExposure'] = (key, text, level, asset) => { if (reported.current.has(key)) return; reported.current.add(key); onExposure(key, text, level, asset); };
  return <dialog ref={dialog} className="language-library-dialog" aria-labelledby="reason-library-title" onCancel={e => { e.preventDefault(); onClose(); }}><header className="dialog-header"><div className="field-row"><h2 id="reason-library-title">我的理由链素材</h2><button type="button" className="btn btn-secondary" onClick={onClose}>返回写作</button></div><p>中文理由链本身是内容帮助；是否适合新题和如何组织，由你决定。</p></header><div className="dialog-body material-body">
    {!saved ? <p role="status">等待本设备保存成功后才能修改。保存失败可从语言素材入口导出备份。</p> : null}
    <div className="field-row"><button type="button" className="btn btn-secondary" disabled={!taskPrompt.trim() || recallStatus === 'loading' || !saved} onClick={() => { setOffset(0); void recall(); }}>{recallStatus === 'error' ? '重试按当前题筛选理由链' : '按当前题筛选理由链'}</button><button type="button" className="btn btn-secondary" onClick={() => { setOffset(0); showAll(); }}>查看全部理由链</button></div>
    {recallStatus === 'loading' ? <p role="status">正在找相关旧理由链，最多3条；可以返回写作。</p> : null}
    {recallStatus === 'error' ? <p role="alert">筛选未完成，可以重试或手动查找。单次最多核对100条可用理由链。</p> : null}
    {related !== null && recallStatus === 'idle' ? <p>点击筛选才展示相关理由链，也可以直接返回写作。</p> : null}
    {recallStatus === 'ready' && !related?.length ? <p>没有足够相关的可用理由链，不补新内容。</p> : null}
    <label>查找中文理由链<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }} /></label>
    {!shown.length && related === null ? <p>没有已保存的匹配理由链，可在完成写作后选择提炼并确认。</p> : null}
    {shown.slice(offset, offset + 3).map(asset => <article className="material-card" key={asset.assetId + ':' + asset.revision}><ReasonDisplay candidate={asset} asset={asset} id={'reason:' + asset.assetId + ':' + asset.revision} onExposure={expose} onIncomplete={onIncomplete} />
      <p>{({ unreviewed: '待核对原文关系，不参与推荐', usable: '节点与关系符合来源，新题仍需另行判断', unusable: '节点或关系与来源不符，不参与推荐', unknown: '关系或原上下文无法确认，不参与推荐' })[asset.quality]}</p>
      {!sourceAvailable(asset) ? <p>原完成稿已删除，仅保留必要摘录。再次修订时缺少全文，只能标为未知。</p> : null}
      <ReasonEditor candidate={asset} saved={saved} label="保存理由链修订" onSave={value => onSave(asset, value)} onIncomplete={onIncomplete} />
      {asset.quality === 'unreviewed' ? <button type="button" className="btn btn-secondary" disabled={!saved || pending.some(p => p.assetId === asset.assetId && p.revision === asset.revision)} onClick={() => onCheck(asset)}>核对理由链来源</button> : null}
      {deleting === asset.assetId ? <p>删除后无法恢复。<button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => { onDelete(asset.assetId); setDeleting(null); setOffset(0); }}>确认删除理由链</button><button type="button" onClick={() => setDeleting(null)}>取消</button></p> : <button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => setDeleting(asset.assetId)}>删除理由链</button>}
    </article>)}
    <div className="field-row"><button type="button" className="btn btn-secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 3))}>上一页</button><button type="button" className="btn btn-secondary" disabled={offset + 3 >= shown.length} onClick={() => setOffset(offset + 3)}>下一页</button></div>
  </div></dialog>;
}
