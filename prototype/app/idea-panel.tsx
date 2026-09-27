'use client';

import { useEffect, useRef, useState } from 'react';
import { ExposureBlock } from './vnext-help-panel';
import { ideaObservation, type IdeaUsageReview, type ContentAsset } from './idea-usage';
import { countReusedDocuments, type ReuseObservation } from './usage-attribution';
import { reasonText } from './reason-chains';
import { useMaterialRecall } from './use-material-recall';
import type { IdeaAsset, IdeaCandidate } from './idea-assets';
import type { WritingCompletion } from './writing-completion';

type ExposureProps = { onExposure: (key: string, text: string, level: 'chinese' | 'english', asset?: IdeaAsset) => void; onIncomplete: () => void };

export function IdeaExtractionPanel({ completion, saved, onAnalyze, onDecide, onExposure, onIncomplete }: ExposureProps & {
  completion: WritingCompletion; saved: boolean; onAnalyze: () => void; onDecide: (index: number, text?: string) => void;
}) {
  const [error, setError] = useState('');
  const analysis = completion.ideas;
  return <section aria-label="保存本次观点" className="idea-panel">
    <h3>保存本次观点</h3><p>只整理你在完成稿中表达的判断，保留原立场与范围；不判断观点在现实中是否正确。</p>
    {!analysis || analysis.status === 'error' ? <><button type="button" className="btn btn-secondary" disabled={!saved} onClick={onAnalyze}>{analysis ? '重试提炼观点' : '提炼观点候选'}</button>{analysis ? <p role="alert">上次未完成，作文不受影响，可以稍后再整理。</p> : null}</> : null}
    {analysis?.status === 'loading' ? <p role="status">正在核对这份完成稿中的观点，可以返回写作。</p> : null}
    {analysis?.status === 'ready' && !analysis.candidates.length ? <p>没有新的合适观点，不必为了保存凑数。</p> : null}
    {analysis?.candidates.map((c, i) => <article className="material-card" key={i}>
      <ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure(`idea:${i}`, c.textZh, 'chinese')}><h4>{c.textZh}</h4></ExposureBlock>
      <p className="material-note">保留理由：这项判断可回到你的完成稿核对。是否用于其他题目需另行判断。</p>
      <ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure(`idea-source:${i}`, c.sourceQuote, 'english')}><blockquote>{c.sourceQuote}</blockquote></ExposureBlock>
      {c.decision === 'pending' ? <form onSubmit={e => { e.preventDefault(); try { onDecide(i, String(new FormData(e.currentTarget).get('textZh'))); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败。'); } }}>
        <details onToggle={e => { if (e.currentTarget.open) onIncomplete(); }}><summary>编辑中文观点</summary><label>保留原文立场与范围<textarea name="textZh" defaultValue={c.textZh} maxLength={400} required /></label></details>
        <p className="material-note">保存后核对与来源是否相符。待核对或不相符的内容不会进入推荐。</p>
        <button type="submit" className="btn btn-primary" disabled={!saved}>保存观点</button>{' '}<button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => onDecide(i)}>忽略观点</button>
      </form> : <p>{c.decision === 'saved' ? '已保存到观点素材；这里保留原候选，修订以素材库为准。' : '已忽略，不进入观点素材。'}</p>}
    </article>)}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

export function IdeaLibraryDialog({ assets, taskPrompt, initialRecall = false, saved, pending, onClose, onSave, onDelete, onCheck, onExposure, onIncomplete }: ExposureProps & {
  assets: IdeaAsset[]; taskPrompt: string; initialRecall?: boolean; saved: boolean; pending: { assetId: string; revision: number }[];
  onClose: () => void; onSave: (asset: IdeaAsset, value: IdeaCandidate) => void; onDelete: (id: string) => void; onCheck: (asset: IdeaAsset) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [error, setError] = useState(''), [deleting, setDeleting] = useState<string | null>(null);
  const { related, recallStatus, recall, showAll } = useMaterialRecall('idea', taskPrompt, assets, initialRecall);
  const shown = assets.filter(a => (related === null || related.includes(a.assetId)) && a.textZh.includes(query.trim())), reported = useRef(new Set<string>());

  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => trigger?.focus(); }, []);
  function expose(asset: IdeaAsset, source = false) {
    const key = `idea:${asset.assetId}:${asset.revision}:${source ? 'source' : 'content'}`;
    if (reported.current.has(key)) return;
    reported.current.add(key); onExposure(key, source ? asset.sourceQuote : asset.textZh, source ? 'english' : 'chinese', asset);
  }
  return <dialog ref={dialog} className="language-library-dialog" aria-labelledby="idea-library-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="dialog-header"><div className="field-row"><h2 id="idea-library-title">我的观点素材</h2><button type="button" className="btn btn-secondary" onClick={onClose}>返回写作</button></div><p>来自你确认的完成稿判断。来源相符不代表事实已证实，也不代表适合新题。</p></header>
    <div className="dialog-body material-body">
      {!saved ? <p role="status">正在保存或本设备保存失败，暂不能修改；保存失败时请从语言素材入口导出备份。</p> : null}
      <p>中文观点本身就是内容提醒；是否用于新题、采用哪种立场，由你决定。</p>
      <div className="field-row"><button type="button" className="btn btn-secondary" disabled={!taskPrompt.trim() || recallStatus === 'loading' || !saved} onClick={() => { setOffset(0); void recall(); }}>{recallStatus === 'error' ? '重试按当前题筛选' : '按当前题筛选观点'}</button><button type="button" className="btn btn-secondary" onClick={() => { setOffset(0); showAll(); }}>查看全部观点</button></div>
      {recallStatus === 'loading' ? <p role="status">正在找相关旧观点，最多3条；可以随时返回写作。</p> : null}
      {recallStatus === 'error' ? <p role="alert">暂未完成筛选，可以重试或手动查找。单次最多核对100条已通过来源检查的观点。</p> : null}
      {related !== null && recallStatus === 'idle' ? <p>点击筛选后才展示相关观点，也可以直接返回写作。</p> : null}
      {recallStatus === 'ready' && !related?.length ? <p>没有足够相关的可用旧观点，不必为了使用素材改变想法。</p> : null}
      <label>查找中文观点<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }} /></label>
      {!shown.length && related === null ? <p>没有已保存的匹配观点。写作完成后可以选择提炼并确认。</p> : null}
      {shown.slice(offset, offset + 3).map(asset => <article className="material-card" key={`${asset.assetId}:${asset.revision}`}>
        <ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => expose(asset)}><h3>{asset.textZh}</h3></ExposureBlock>
        <p>{({ unreviewed: '待核对来源，不参与推荐', usable: '与来源相符，新题仍需另行判断', unusable: '与来源不相符，不参与推荐', unknown: '暂无法确认，不参与推荐' })[asset.quality]}</p>
        <details><summary>回看来源</summary><ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => expose(asset, true)}><blockquote>{asset.sourceQuote}</blockquote></ExposureBlock></details>
        <form onSubmit={e => { e.preventDefault(); try { onSave(asset, { textZh: String(new FormData(e.currentTarget).get('textZh')), sourceQuote: asset.sourceQuote }); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败。'); } }}>
          <details onToggle={e => { if (e.currentTarget.open) onIncomplete(); }}><summary>编辑观点</summary><label>中文观点<textarea name="textZh" defaultValue={asset.textZh} maxLength={400} required /></label><button type="submit" className="btn btn-secondary" disabled={!saved}>保存修订并重新核对</button></details>
        </form>
        {asset.quality === 'unreviewed' ? <button type="button" className="btn btn-secondary" disabled={!saved || pending.some(p => p.assetId === asset.assetId && p.revision === asset.revision)} onClick={() => onCheck(asset)}>核对来源</button> : null}
        {deleting === asset.assetId ? <p>删除后无法恢复。<button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => { onDelete(asset.assetId); setDeleting(null); setOffset(0); }}>确认删除观点</button><button type="button" onClick={() => setDeleting(null)}>取消</button></p> : <button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => setDeleting(asset.assetId)}>删除观点</button>}
      </article>)}
      <div className="field-row"><button type="button" className="btn btn-secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 3))}>上一页</button><button type="button" className="btn btn-secondary" disabled={offset + 3 >= shown.length} onClick={() => setOffset(offset + 3)}>下一页</button></div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </dialog>;
}

const ideaAssistance = { unprompted_observed: '记录中，在相关内容提醒前已表达', chinese: '此前看过这条中文内容素材（内容提醒）', english: '此前看过这条内容素材的英文依据', full_reference: '此前看过完整句参考', unknown: '过程或帮助相关性不足，不能判断是否独立表达' };
export function ContentUsagePanel({ reason = false, documentId, completion, assets, observations, saved, onAnalyze, onCorrect, onExposure, onIncomplete }: { onExposure: (key: string, text: string, level: 'chinese' | 'english', asset?: ContentAsset) => void; onIncomplete: () => void; reason?: boolean;
  documentId: string; completion: WritingCompletion; assets: ContentAsset[]; observations: ReuseObservation[]; saved: boolean;
  onAnalyze: (asset: ContentAsset) => void; onCorrect: (id: string, correction: IdeaUsageReview['correction']) => void;
}) {
  const noun = reason ? '理由链' : '观点';
  const field = reason ? 'reasonUsageReviews' : 'ideaUsageReviews';
  return <section className="idea-panel" aria-label={'旧' + noun + '使用核对'}><h3>旧{noun}在本稿中的使用</h3>
    <p>核对是否忠实保留原含义与关系，再看表达前展示过什么。改变立场并不表示你写错；中文内容素材也是内容帮助，不能算成自主想到。</p>
    {!(reason ? completion.writingTrace?.initialReasons : completion.writingTrace?.initialIdeas) ? <p>这份旧稿没有写作开始时的内容素材记录，跨篇复用资格保持未知。</p> : null}
    {!assets.length ? <p>暂无已核对可用的旧内容素材。</p> : null}
    {assets.map(asset => {
      const textZh = 'nodes' in asset ? reasonText(asset) : asset.textZh;
      const r = completion[field]?.find(r => r.asset.assetId === asset.assetId && r.asset.revision === asset.revision);
      const observed = r ? ideaObservation(documentId, completion, r) : null;
      return <article className="material-card" key={asset.assetId + ':' + asset.revision}>
        <ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure('idea-review:' + asset.assetId + ':' + asset.revision, textZh, 'chinese', asset)}><h4>{textZh}</h4></ExposureBlock>
        <p>已核对的不同作文中，忠实且适合题目的使用 {countReusedDocuments(observations, asset.assetId, asset.revision)} 篇；同篇多次完成只计一篇。</p>
        {r?.status === 'loading' ? <p role="status">正在核对完成稿与提示前正文，可以返回写作。</p> : <button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => onAnalyze(asset)}>{r?.status === 'error' ? '重新核对内容使用' : r?.status === 'ready' ? '再次核对内容使用' : '核对内容使用'}</button>}
        {r?.status === 'error' ? <p role="alert">本次未完成，不计入结论。原文保留，可以重试。</p> : null}
        {r?.status === 'ready' && r.result && observed ? <>
          {!r.result.complete ? <p>本次未能完整核对，不能作为成功复用。</p> : null}
          {!r.result.occurrences.length ? <p>{r.result.complete ? '完成稿未观察到作者采用这条内容素材。' : '是否采用仍未知。'}</p> : null}
          {r.result.occurrences.map((o, i) => <ExposureBlock key={i} enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure('idea-result:' + r.attemptId + ':' + i, o.quote, 'english', asset)}><p>{({ appropriate: '此处忠实保留原含义与关系且适合题目', inappropriate: '此处改变了原有含义、关系或适用范围，不计相同素材复用', unknown: '此处含义尚不明确，不能确认采用' })[o.verdict]}</p><blockquote>{o.quote}</blockquote></ExposureBlock>)}
          {observed.finalExpression ? <p>{ideaAssistance[observed.finalExpression.assistance]}。展示记录不能证明你实际使用了提示。</p> : null}
          {observed.finalExpression?.observedLevels.includes('chinese') ? <p>已记录：最终表达前曾展示这条中文内容素材。</p> : null}
          {observed.earlierExpression && observed.earlierExpression.evidenceId !== observed.finalExpression?.evidenceId ? <ExposureBlock enabled fullyVisible onPartial={onIncomplete} onVisible={() => onExposure('idea-earlier:' + r.attemptId, observed.earlierExpression!.quote, 'english', asset)}><p>更早还观察到：{ideaAssistance[observed.earlierExpression.assistance]}</p><blockquote>{observed.earlierExpression.quote}</blockquote></ExposureBlock> : null}
          {observed.eligibility !== 'yes' ? <p>{observed.eligibility === 'unknown' ? '写作开始时的版本未知' : '来自本篇，或写作开始时没有此版本'}，不计跨篇复用。</p> : null}
          <details><summary>核对依据与调用次数</summary><p>本次完成 {r.callCount} 次模型调用，重复正文共用结果；最多核对5份不同的提示前正文，超出部分保持未知。其他入口显示的内容另行核对相关性，每批最多20条、最多4次；相同内容共用结果，旧记录未经核对时保持未知。</p>
            {r.modelCalls ? <p>分析版本：{[...new Set(r.modelCalls.map(m => m.promptVersion + ' · ' + m.model))].join('；')}</p> : <p>旧记录未保留分析版本，不据此比较不同模型效果。</p>}
            {observed.evidence.events.map((e, i) => <p key={e.eventId}>顺序 {e.order}：{e.relation === 'yes' ? e.level === 'chinese' ? '展示这条中文内容素材' : '展示这条内容素材的英文依据' : e.relation === 'no' ? '与这条内容素材无关，不计帮助' : '其他提示或外部内容，相关性未知'}（对应提示前正文记录 {i + 1}）</p>)}
          </details>
          <label>纠正内容素材记录<select value={r.correction} onChange={e => onCorrect(asset.assetId, e.target.value as IdeaUsageReview['correction'])}><option value="none">保留系统记录</option><option value="exclude">判断不准，撤出统计</option><option value="external">用过外部帮助，来源保持未知</option></select></label>
        </> : null}
      </article>;
    })}
  </section>;
}
