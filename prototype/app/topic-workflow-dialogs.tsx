'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CompletedArticleVersion } from './article-completion';
import { feedbackProblemText, groupFeedbackSuggestions, placeFeedbackNotes, type FeedbackRun } from './essay-feedback';
import { isArgumentGraphAsset, isThoughtAssetCandidate, topicAssetItemCount, topicLanguageExpressions } from './topic-assets';
import type { TopicAssetCandidate, TopicAssetPack } from './topic-assets';
import { argumentAssetPrinciple, argumentAssetSourceDocumentIds, findSimilarArgumentAssets, findSimilarThoughtAssets, type ArgumentAsset, type ArgumentAssetDecision, type ArgumentAssetUsage, type LegacyArgumentAsset, type ThoughtAsset, type ThoughtAssetUpdate } from './argument-assets';
import type { ArgumentAssetRecallMatch } from './argument-asset-recall';

function DialogFrame({ title, subtitle, onClose, children, className = '', busy = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; className?: string; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => trigger?.focus(); }, []);
  return <dialog ref={ref} className={`workflow-dialog ${className}`} aria-labelledby="workflow-dialog-title" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <header className="dialog-header workflow-dialog-header"><div><h2 id="workflow-dialog-title">{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button className="support-close" type="button" onClick={onClose} disabled={busy} aria-label={`关闭${title}`}>×</button></header>
    {children}
  </dialog>;
}

const FEEDBACK_LABELS: Record<string, string> = { clarity: '观点清晰度', reasoning: '理由', redundancy: '重复', logic: '逻辑', example: '例证', language: '表达', cohesion: '衔接' };
const CRITERION_LABELS: Record<string, string> = { task_response: '任务回应', coherence_cohesion: '连贯与衔接', lexical_resource: '词汇', grammatical_range_accuracy: '语法' };

export function EssayFeedbackPanel({ run, stale, activeSentenceKey, sentenceKeys, tops, onRun, onClose, onActivate, onLocate }: { run?: FeedbackRun; stale: boolean; activeSentenceKey: string | null; sentenceKeys: string[]; tops: Array<number | null>; onRun: () => void; onClose: () => void; onActivate: (key: string | null) => void; onLocate: (sourceQuote: string) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const noteRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [placedTops, setPlacedTops] = useState<number[]>([]);
  const { groups, anchorTops } = useMemo(() => {
    const nextGroups = groupFeedbackSuggestions(sentenceKeys).sort((a, b) => {
      const top = (group: typeof a) => group.indexes.map(index => tops[index]).find(value => value !== null) ?? Number.POSITIVE_INFINITY;
      return top(a) - top(b);
    });
    return { groups: nextGroups, anchorTops: nextGroups.map((group, index) => group.indexes.map(itemIndex => tops[itemIndex]).find(value => value !== null) ?? 170 + index * 48) };
  }, [sentenceKeys, tops]);

  useLayoutEffect(() => {
    if (run?.status !== 'ready') return;
    const place = () => {
      const actions = document.querySelector<HTMLElement>('.essay-workflow-actions');
      const availableHeight = actions && getComputedStyle(actions).position === 'fixed'
        ? actions.getBoundingClientRect().top : window.innerHeight;
      const next = placeFeedbackNotes(anchorTops, groups.map((_, index) => noteRefs.current[index]?.offsetHeight ?? 0), availableHeight);
      setPlacedTops(current => current.length === next.length && current.every((top, index) => top === next[index]) ? current : next);
    };
    place();
    const observer = new ResizeObserver(place);
    noteRefs.current.slice(0, groups.length).forEach(note => { if (note) observer.observe(note); });
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [anchorTops, groups, openKey, run?.id, run?.status]);

  return <>
    <button className="feedback-mobile-close" type="button" onClick={onClose} aria-label="关闭全文审阅">×</button>
    <div className="support-content feedback-panel-content">
      {!run || run.status === 'loading' ? <div className="workflow-state" role="status"><span className="spinner" aria-hidden="true" /><p>正在审阅点击时的当前全文…</p></div> : null}
      {run?.status === 'error' ? <div className="workflow-state error-card" role="alert"><p>{run.error}</p><button className="btn btn-secondary" type="button" onClick={onRun}>重新获取</button></div> : null}
      {run?.status === 'ready' ? <>
        {run.suggestions.length ? <ol className={`essay-suggestions feedback-annotations${openKey ? ' has-open' : ''}`}>{groups.map((group, groupIndex) => {
          const isOpen = openKey === group.key;
          const isCurrent = activeSentenceKey === group.key;
          const labels = [...new Set(group.indexes.map(index => {
            const suggestion = run.suggestions[index];
            return `${suggestion.criterion ? `${CRITERION_LABELS[suggestion.criterion]} · ` : ''}${FEEDBACK_LABELS[suggestion.type] ?? suggestion.type}`;
          }))].join(' / ');
          const primary = run.suggestions[group.indexes[0]];
          return <li ref={node => { noteRefs.current[groupIndex] = node; }} className={`${isOpen ? 'is-open ' : ''}${isCurrent ? 'is-current' : ''}`} key={group.key} style={{ top: Math.round(placedTops[groupIndex] ?? anchorTops[groupIndex]) }} onMouseEnter={() => onActivate(group.key)} onMouseLeave={() => onActivate(null)} onFocusCapture={() => onActivate(group.key)} onBlurCapture={() => onActivate(null)}>
            <button className="feedback-annotation-toggle" type="button" aria-expanded={isOpen} onClick={() => setOpenKey(current => current === group.key ? null : group.key)}>
              <span className="feedback-note-index">{String(groupIndex + 1).padStart(2, '0')}</span>
              <span className="feedback-note-copy">
                <strong>{labels}{group.indexes.length > 1 ? ` · ${group.indexes.length} 条` : ''}{stale ? ' · 上一版' : ''}{isCurrent ? <em>当前句</em> : null}</strong>
                <span className="feedback-note-source" lang="en">{primary.sourceQuote}</span>
                <small><b>问题</b>{feedbackProblemText(primary.problemZh)}</small>
              </span>
              <span className="feedback-note-arrow" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen ? <div className="feedback-annotation-body">{group.indexes.map(index => {
              const suggestion = run.suggestions[index];
              return <section className="feedback-annotation-item" key={`${suggestion.sourceQuote}-${index}`}>
                <blockquote className="feedback-source-context">{suggestion.sourceQuote}</blockquote>
                {group.indexes.length > 1 ? <span>{suggestion.criterion ? `${CRITERION_LABELS[suggestion.criterion]} · ` : ''}{FEEDBACK_LABELS[suggestion.type] ?? suggestion.type}</span> : null}
                {group.indexes.length > 1 ? <p><strong>问题：</strong>{feedbackProblemText(suggestion.problemZh)}</p> : null}
                <p><strong>修改方向：</strong>{suggestion.directionZh}</p>
                <button className="feedback-locate" type="button" onClick={() => onLocate(suggestion.sourceQuote)}>定位原文</button>
              </section>;
            })}</div> : null}
          </li>;
        })}</ol> : <div className="workflow-empty">当前没有必须修改的明显问题。</div>}
      </> : null}
    </div>
  </>;
}

export type CompletionPreview = {
  documentId: string;
  sourceTitle: string;
  taskPrompt: string;
  snapshot: string;
  updatedAt: string;
};

function displayTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }

export function CompletionConfirmDialog({ preview, onConfirm, onClose, busy, error, existingVersion, onResume }: {
  preview: CompletionPreview;
  onConfirm: (saveReason: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
  existingVersion?: CompletedArticleVersion;
  onResume?: () => void;
}) {
  const [saveReason, setSaveReason] = useState('');
  const previewKey = JSON.stringify([preview.documentId, preview.taskPrompt, preview.snapshot]);
  const [confirmation, setConfirmation] = useState({ previewKey, checked: false });
  if (confirmation.previewKey !== previewKey) setConfirmation({ previewKey, checked: false });
  const confirmed = confirmation.previewKey === previewKey && confirmation.checked;
  const differentVersion = existingVersion && (existingVersion.snapshot !== preview.snapshot || existingVersion.taskPrompt !== preview.taskPrompt);
  return <DialogFrame title="确认完成版本" subtitle="请回看这版全文。确认后将保留这一版，后续修改不会改动它。" onClose={onClose} busy={busy}>
    <div className="dialog-body workflow-dialog-body">
      <section className="completion-version" aria-label="待确认的文章版本">
        <p className="completion-prompt">{preview.taskPrompt}</p>
        <p className="completion-meta">正文更新时间：<time dateTime={preview.updatedAt}>{displayTime(preview.updatedAt)}</time></p>
        <div className="completion-preview source-essay" role="region" aria-label="本次待确认的完整正文" tabIndex={0}>{preview.snapshot}</div>
      </section>
      {differentVersion && onResume ? <div className="workflow-notice"><p>你还有一个已确认版本。当前正文有新修改，两版会分别保留。</p><button className="btn btn-secondary" type="button" disabled={busy} onClick={onResume}>继续整理已确认版本</button></div> : null}
      {/[\u3400-\u9fff]/.test(preview.snapshot) ? <p className="workflow-notice">正文仍有中文内容。如果是尚未写完的占位，请先返回修改；系统不会自动替你补写。</p> : null}
      <label className="completion-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmation({ previewKey, checked: event.target.checked })} /><span>我已亲自检查、修改，并认可这版文章表达了我的意思。</span></label>
      <label className="completion-reason">这版有什么值得以后再用？（选填）<textarea value={saveReason} maxLength={300} rows={3} disabled={busy} onChange={event => setSaveReason(event.target.value)} placeholder="例如：我想留下“交通便利如何减少开车”的这段理由。" /><span>{saveReason.length}/300 · 留空也可以继续。</span></label>
      {error ? <p className="workflow-notice" role="alert">{error}</p> : null}
      <div className="workflow-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>返回继续修改</button><button className="btn btn-primary" type="button" disabled={busy || !confirmed} onClick={() => onConfirm(saveReason.trim())}>{busy ? '正在保留完成版本…' : '确认这版，开始整理'}</button></div>
    </div>
  </DialogFrame>;
}

function SourceQuote({ quote }: { quote: string | null }) {
  return <div className="material-source"><span>来源原句</span>{quote ? <blockquote>{quote}</blockquote> : <p>未提供可核对的来源原句，请删除这条。</p>}</div>;
}

function ArgumentGraphReview({ candidate }: { candidate: TopicAssetCandidate; update: (next: Partial<TopicAssetCandidate>) => void }) {
  if (!isArgumentGraphAsset(candidate)) return null;
  return <p className="legacy-expression-badge">这是旧版结构记录。完成版本和历史素材仍会保留，但新版不再展示或扩展其节点结构。</p>;
}

function ThoughtReview({ candidate, update }: { candidate: TopicAssetCandidate; update: (next: Partial<TopicAssetCandidate>) => void }) {
  if (!isThoughtAssetCandidate(candidate) || !candidate.thought) return null;
  const thought = candidate.thought;
  return <section className="deposit-item transfer-structure">
    <p className="argument-node-kind">过去形成的思考</p>
    <label>什么时候想到它<textarea value={thought.useWhen ?? ''} maxLength={600} rows={2} onChange={event => update({ thought: { ...thought, useWhen: event.target.value || null } })} /></label>
    <label>可迁移的核心判断<textarea value={thought.thought} maxLength={800} rows={3} onChange={event => update({ thought: { ...thought, thought: event.target.value } })} /></label>
    <label>为什么成立（选填）<textarea value={thought.rationale ?? ''} maxLength={1000} rows={3} onChange={event => update({ thought: { ...thought, rationale: event.target.value || null } })} /></label>
    <label>什么时候不能用（每行一条，选填）<textarea value={thought.limits.join('\n')} maxLength={1800} rows={3} onChange={event => update({ thought: { ...thought, limits: event.target.value.split('\n').map(value => value.trim()).filter(Boolean).slice(0, 6) } })} /></label>
    <div className="material-source"><span>来源证据</span>{thought.sourceQuotes.map((quote, index) => <blockquote key={`${quote}:${index}`}>{quote}</blockquote>)}</div>
    <button type="button" className="text-button" onClick={() => update({ thought: null })}>不保存这条思考</button>
  </section>;
}

function ThoughtAssetChoices({ candidate, assets, decision, onDecision }: { candidate: TopicAssetCandidate; assets: ArgumentAsset[]; decision?: ArgumentAssetDecision; onDecision: (decision: ArgumentAssetDecision) => void }) {
  if (!isThoughtAssetCandidate(candidate) || !candidate.thought) return null;
  const similar = findSimilarThoughtAssets(candidate.thought, assets);
  return <section className="argument-asset-choice" aria-labelledby="thought-asset-choice-title">
    <div className="material-section-heading"><h3 id="thought-asset-choice-title">这条思考要怎样保存？</h3><p>它来自你确认的完成稿，由你决定是否进入长期积累。</p></div>
    {similar.length ? <div className="similar-asset-list">{similar.map(asset => <article className="similar-asset" key={asset.assetId}><strong>{asset.thought}</strong><p>{asset.sources.length} 条来源</p><div className="material-actions"><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'link' && decision.assetId === asset.assetId} onClick={() => onDecision({ action: 'link', assetId: asset.assetId })}>作为同一思考的新来源</button>{decision?.assetId === asset.assetId ? <button type="button" className="text-button" onClick={() => onDecision({ action: 'replace', assetId: asset.assetId })}>同时更新思考表述</button> : null}</div></article>)}</div> : <p className="completion-meta">没有内容相同的已有思考。</p>}
    <div className="argument-decision-actions"><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'new'} onClick={() => onDecision({ action: 'new' })}>保存为新思考</button><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'skip'} onClick={() => onDecision({ action: 'skip' })}>不保存</button></div>
    {decision ? <p className="decision-status" role="status">当前选择：{decision.action === 'new' ? '建立新的长期思考' : decision.action === 'skip' ? '只保留完成版本' : decision.action === 'replace' ? '增加来源并更新表述' : '增加为已有思考的新来源'}</p> : <p className="workflow-notice">请选择后才能保存。</p>}
  </section>;
}

function ArgumentAssetChoices({ candidate, assets, suggestedAssetIds, decision, onDecision }: { candidate: TopicAssetCandidate; assets: ArgumentAsset[]; suggestedAssetIds: string[]; decision?: ArgumentAssetDecision; onDecision: (decision: ArgumentAssetDecision) => void }) {
  if (!isArgumentGraphAsset(candidate)) return null;
  const claim = candidate.argumentNodes.find(node => node.type === 'claim');
  if (!claim) return null;
  const suggested = [...new Map([...assets.filter((asset): asset is LegacyArgumentAsset => asset.kind === 'claim' && suggestedAssetIds.includes(asset.assetId)), ...findSimilarArgumentAssets(claim, assets)].map(asset => [asset.assetId, asset])).values()].slice(0, 3);
  return <section className="argument-asset-choice" aria-labelledby="argument-asset-choice-title">
    <div className="material-section-heading"><h3 id="argument-asset-choice-title">这条观点要怎样进入长期素材？</h3><p>系统只提供候选，最终关系由你确认。</p></div>
    {suggested.length ? <div className="similar-asset-list"><p className="completion-meta">旧版记录中存在相同观点：</p>{suggested.map(asset => <article className="similar-asset" key={asset.assetId}><strong>{argumentAssetPrinciple(asset)}</strong><p>{asset.occurrenceIds.length} 条来源</p><div className="material-actions"><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'link' && decision.assetId === asset.assetId} onClick={() => onDecision({ action: 'link', assetId: asset.assetId })}>关联旧版观点</button></div></article>)}</div> : <p className="completion-meta">没有可直接关联的已有思维资产。</p>}
    <div className="argument-decision-actions"><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'new'} onClick={() => onDecision({ action: 'new' })}>作为新思维资产保存</button><button type="button" className="btn btn-secondary" aria-pressed={decision?.action === 'skip'} onClick={() => onDecision({ action: 'skip' })}>不保存这条思维模式</button></div>
    {decision ? <p className="decision-status" role="status">当前选择：{decision.action === 'new' ? '新建长期思维资产' : decision.action === 'skip' ? '只保留本篇提炼记录' : decision.action === 'replace' ? '关联并采用当前思维模式' : '关联到已有思维资产'}</p> : <p className="workflow-notice">请选择后才能保存。</p>}
  </section>;
}

export function DepositDialog({ session, assets, suggestedAssetIds = [], onDecision, onChange, onSave, onRetry, onClose, onUseCurrent, onViewSaved, busy, error, changed, unsaved = false }: {
  session: CompletedArticleVersion;
  assets: ArgumentAsset[];
  suggestedAssetIds?: string[];
  onDecision: (decision: ArgumentAssetDecision) => void;
  onChange: (candidate: TopicAssetCandidate) => void;
  onSave: () => void;
  onRetry: () => void;
  onClose: () => void;
  onUseCurrent?: () => void;
  onViewSaved?: () => void;
  busy: boolean;
  error: string | null;
  changed: boolean;
  unsaved?: boolean;
}) {
  const candidate = session.candidate;
  const count = candidate ? topicAssetItemCount(candidate) : 0;
  const languageExpressions = candidate ? topicLanguageExpressions(candidate) : [];
  const finished = session.status === 'saved' || session.status === 'empty';
  const needsDecision = Boolean(candidate && ((isThoughtAssetCandidate(candidate) && candidate.thought) || (isArgumentGraphAsset(candidate) && candidate.argumentNodes.some(node => node.type === 'claim'))) && !session.argumentDecision);
  const update = (next: Partial<TopicAssetCandidate>) => candidate && onChange({ ...candidate, ...next });
  const title = session.status === 'saved' ? '本次素材已保存' : session.status === 'empty' ? '本次整理已结束' : session.status === 'ready' ? '检查要保存的素材' : '整理本次完成版本';
  return <DialogFrame title={title} subtitle={`来自：${session.sourceTitle}`} onClose={onClose} className="deposit-dialog" busy={busy}>
    <div className="dialog-body workflow-dialog-body">
      <div className="completion-meta"><p>完成版本确认于 <time dateTime={session.confirmedAt}>{displayTime(session.confirmedAt)}</time></p>{session.saveReason ? <p>你想留下：{session.saveReason}</p> : null}</div>
      <details className="completion-source"><summary>查看本次完成版全文</summary><p className="completion-prompt">{session.taskPrompt}</p><p className="source-essay">{session.snapshot}</p></details>
      {changed ? <div className="workflow-notice"><p>当前正文有新修改。这里仍对应上面这份已确认版本。</p>{onUseCurrent ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={onUseCurrent}>改用当前正文，重新确认</button> : null}</div> : null}
      {error ? <p className="workflow-notice" role="alert">{error}</p> : null}
      {unsaved ? <p className="workflow-notice" role="alert">本次删改尚未可靠保存。点击“稍后整理”可重试保留待检查内容，成功后才会关闭；正式素材尚未改变。</p> : null}
      {session.status === 'loading' ? <div className="workflow-state" role="status"><span className="spinner" aria-hidden="true" /><p>完成版本已保留，正在整理素材…</p></div> : null}
      {session.status === 'pending' ? <div className="workflow-empty"><p>完成版本已保留，还没有整理素材。</p><button className="btn btn-secondary" type="button" disabled={busy} onClick={onRetry}>开始整理</button></div> : null}
      {session.status === 'error' ? <div className="workflow-state error-card" role="alert"><p>{session.error}</p><button className="btn btn-secondary" type="button" disabled={busy} onClick={onRetry}>重试整理这个完成版本</button></div> : null}
      {session.status === 'ready' && candidate ? <>
        <p className="completion-meta">保留 {count} 条素材。请核对来源，删除不想留下的内容；确认保存前不会进入“我的素材”。</p>
        {count ? <fieldset className="deposit-fields" disabled={busy} aria-label="检查和编辑本次素材">
          {isThoughtAssetCandidate(candidate) ? <><ThoughtReview candidate={candidate} update={update} />
          <section className="deposit-section expression-review"><h3>可迁移表达</h3><p className="completion-meta">表达单独保存，原句只用于核对。</p>{languageExpressions.length ? <div className="deposit-collocations">{languageExpressions.map((item, index) => <div className="deposit-item" key={`${item.expression}-${index}`}><label>可迁移表达<input value={item.expression} maxLength={240} onChange={event => candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.map((entry, itemIndex) => itemIndex === index ? { ...entry, expression: event.target.value } : entry) })} /></label><label>中文意义 / 表达功能<input value={item.meaningZh} maxLength={300} onChange={event => candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.map((entry, itemIndex) => itemIndex === index ? { ...entry, meaningZh: event.target.value } : entry) })} /></label><SourceQuote quote={item.sourceQuote} /><button type="button" className="text-button" onClick={() => candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.filter((_, itemIndex) => itemIndex !== index) })}>删除这条表达</button></div>)}</div> : <p className="completion-meta">本篇没有可靠的可迁移表达。</p>}</section>
          <ThoughtAssetChoices candidate={candidate} assets={assets} decision={session.argumentDecision} onDecision={onDecision} /></> : isArgumentGraphAsset(candidate) ? <ArgumentGraphReview candidate={candidate} update={update} /> : <>
          <section className="deposit-section"><h3>观点</h3>{candidate.viewpoint ? <div className="deposit-item"><strong>{candidate.viewpoint.textEn}</strong><label>中文解释<input value={candidate.viewpoint.meaningZh} maxLength={500} onChange={event => update({ viewpoint: { ...candidate.viewpoint!, meaningZh: event.target.value } })} /></label><SourceQuote quote={candidate.viewpoint.sourceQuote} /><button type="button" className="text-button" onClick={() => update({ viewpoint: null })}>删除这条</button></div> : <p className="completion-meta">未保留观点。</p>}</section>
          <section className="deposit-section"><h3>理由</h3>{candidate.reasons.length ? candidate.reasons.map((reason, index) => <div className="deposit-item" key={`${reason.sourceQuote}-${index}`}><label>中文概括<input value={reason.summaryZh} maxLength={500} onChange={event => update({ reasons: candidate.reasons.map((item, itemIndex) => itemIndex === index ? { ...item, summaryZh: event.target.value } : item) })} /></label><SourceQuote quote={reason.sourceQuote} /><button type="button" className="text-button" onClick={() => update({ reasons: candidate.reasons.filter((_, itemIndex) => itemIndex !== index) })}>删除这条</button></div>) : <p className="completion-meta">未保留理由。</p>}</section>
          <section className="deposit-section"><h3>例证思路</h3>{candidate.exampleIdea ? <div className="deposit-item"><label>中文概括<input value={candidate.exampleIdea.summaryZh} maxLength={500} onChange={event => update({ exampleIdea: { ...candidate.exampleIdea!, summaryZh: event.target.value } })} /></label><SourceQuote quote={candidate.exampleIdea.sourceQuote} /><button type="button" className="text-button" onClick={() => update({ exampleIdea: null })}>删除这条</button></div> : <p className="completion-meta">未保留例证思路。</p>}</section>
          <section className="deposit-section expression-review"><h3>可迁移表达</h3><p className="completion-meta">表达是以后复用的本体；原文用法和来源原句只用于核对。</p>{languageExpressions.length ? <div className="deposit-collocations">{languageExpressions.map((item, index) => <div className="deposit-item" key={`${item.expression}-${index}`}>
            {item.legacy ? <p className="legacy-expression-badge">旧版摘录 · 尚未按新规则抽象</p> : <label>可迁移表达<input value={item.expression} maxLength={240} onChange={event => candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.map((entry, itemIndex) => itemIndex === index ? { ...entry, expression: event.target.value } : entry) })} /></label>}
            <label>中文意义 / 表达功能<input value={item.meaningZh} maxLength={300} onChange={event => item.legacy ? candidate.collocations && update({ collocations: candidate.collocations.map((entry, itemIndex) => itemIndex === index ? { ...entry, meaningZh: event.target.value } : entry) }) : candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.map((entry, itemIndex) => itemIndex === index ? { ...entry, meaningZh: event.target.value } : entry) })} /></label>
            {!item.legacy && candidate.languageExpressions ? <><label>使用结构（选填）<input value={item.pattern ?? ''} maxLength={300} placeholder="例如：place a heavy + [类型] + burden on + [对象]" onChange={event => update({ languageExpressions: candidate.languageExpressions!.map((entry, itemIndex) => itemIndex === index ? { ...entry, pattern: event.target.value || null } : entry) })} /></label><label>使用限制（选填）<textarea value={item.usageScope ?? ''} maxLength={400} rows={2} placeholder="只写防止误用所需的限制" onChange={event => update({ languageExpressions: candidate.languageExpressions!.map((entry, itemIndex) => itemIndex === index ? { ...entry, usageScope: event.target.value || null } : entry) })} /></label><div className="material-source"><span>原文中的实际用法</span><strong>{item.sourceForm}</strong></div></> : <strong>{item.expression}</strong>}
            <SourceQuote quote={item.sourceQuote} /><button type="button" className="text-button" onClick={() => item.legacy ? candidate.collocations && update({ collocations: candidate.collocations.filter((_, itemIndex) => itemIndex !== index) }) : candidate.languageExpressions && update({ languageExpressions: candidate.languageExpressions.filter((_, itemIndex) => itemIndex !== index) })}>删除这条</button>
          </div>)}</div> : <p className="completion-meta">本篇没有可靠的可迁移表达；系统不会为了凑数保存作文切片。</p>}</section>
          </>}
          {isArgumentGraphAsset(candidate) ? <ArgumentAssetChoices candidate={candidate} assets={assets} suggestedAssetIds={suggestedAssetIds} decision={session.argumentDecision} onDecision={onDecision} /> : null}
        </fieldset> : <div className="workflow-empty">完成版本已保留，暂时没有要保存的素材。结束整理不会建立空素材包。</div>}
        <div className="workflow-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>稍后整理</button><button className="btn btn-primary" type="button" disabled={busy || needsDecision} onClick={onSave}>{busy ? '正在保存…' : count ? '确认保存这些素材' : '结束本次整理'}</button></div>
      </> : null}
      {finished ? <><div className="workflow-empty" role="status">{session.status === 'saved' ? <><p>{candidate && (isThoughtAssetCandidate(candidate) || isArgumentGraphAsset(candidate)) ? session.argumentDecision?.action === 'skip' ? '完成版本已保留，这条思考没有进入长期积累。' : session.argumentDecision?.action === 'new' ? '已保存一条新的长期思考和来源证据。' : session.argumentDecision?.action === 'replace' ? '已增加新来源，并更新思考表述。' : '已作为同一思考的新来源保存。' : '本次素材已保存。'}</p><p>来源原句和确认版本仍可追溯。</p></> : <p>完成版本已保留，本次没有保存素材。</p>}</div><div className="workflow-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>返回文章</button>{session.status === 'saved' && onViewSaved ? <button className="btn btn-primary" type="button" disabled={busy} onClick={onViewSaved}>查看本次素材</button> : null}</div></> : null}
      {!finished && session.status !== 'ready' ? <div className="workflow-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>稍后整理</button></div> : null}
    </div>
  </DialogFrame>;
}

function ThoughtAssetCard({ asset, usages, packs, onEdit, onDelete, onOpenSource }: { asset: ThoughtAsset; usages: ArgumentAssetUsage[]; packs: TopicAssetPack[]; onEdit: (id: string, value: ThoughtAssetUpdate) => void; onDelete: (id: string) => void; onOpenSource: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ thought: asset.thought, useWhen: asset.useWhen ?? '', rationale: asset.rationale ?? '', limits: asset.limits?.join('\n') ?? '' });
  const assetUsages = usages.filter(usage => usage.assetId === asset.assetId);
  const sourceDocuments = new Set(asset.sources.map(source => source.documentId));
  const expressions: Array<ReturnType<typeof topicLanguageExpressions>[number]> = [];
  for (const pack of packs) if (sourceDocuments.has(pack.sourceDocumentId)) expressions.push(...topicLanguageExpressions(pack));
  return <details className="material-card argument-card argument-asset-card"><summary><span><small>{asset.useWhen ? '什么时候想到它' : '旧版思考'}</small><strong>{asset.useWhen ?? asset.thought}</strong>{asset.useWhen ? <p>{asset.thought}</p> : null}<time>来自 {new Set(asset.sources.map(source => source.documentId)).size} 篇作文 · {asset.sources.length} 条证据</time></span></summary>
    <div className="pack-content argument-pack-content">
      {editing ? <fieldset className="asset-edit-fields"><label>什么时候想到它<textarea value={draft.useWhen} maxLength={600} rows={2} onChange={event => setDraft({ ...draft, useWhen: event.target.value })} /></label><label>可迁移的核心判断<textarea value={draft.thought} maxLength={800} rows={3} onChange={event => setDraft({ ...draft, thought: event.target.value })} /></label><label>为什么成立（选填）<textarea value={draft.rationale} maxLength={1000} rows={3} onChange={event => setDraft({ ...draft, rationale: event.target.value })} /></label><label>什么时候不能用（每行一条）<textarea value={draft.limits} maxLength={1800} rows={3} onChange={event => setDraft({ ...draft, limits: event.target.value })} /></label><div className="material-actions"><button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>取消</button><button className="btn btn-primary" type="button" disabled={!draft.thought.trim()} onClick={() => { onEdit(asset.assetId, { thought: draft.thought, useWhen: draft.useWhen || undefined, rationale: draft.rationale || undefined, limits: draft.limits.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 6) }); setEditing(false); }}>保存修改</button></div></fieldset> : <>
        {asset.rationale ? <section><h4>为什么成立</h4><p>{asset.rationale}</p></section> : null}
        {asset.limits?.length ? <section><h4>什么时候不能用</h4><ul>{asset.limits.map(limit => <li key={limit}>{limit}</li>)}</ul></section> : null}
        <div className="material-actions"><button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}>编辑</button></div>
      </>}
      <section><h4>我在哪里形成了它</h4>{asset.sources.map((source, index) => <article className="asset-source-record" key={`${source.documentId}:${source.revisionId}:${index}`}><strong>{source.sourceTitle}</strong><p>{source.taskPrompt}</p><SourceQuote quote={source.quote} /><button className="text-button" type="button" onClick={() => onOpenSource(source.documentId)}>查看来源</button></article>)}</section>
      {expressions.length ? <details><summary>这几篇文章中的表达（{expressions.length}）</summary>{expressions.map((item, index) => <article className="asset-source-record" key={`${item.expression}:${index}`}><strong>{item.expression}</strong><p>{item.meaningZh}</p><SourceQuote quote={item.sourceQuote} /></article>)}</details> : null}
      <section><h4>历史记录</h4>{assetUsages.length ? <p>曾在 {assetUsages.length} 篇完成稿中再次出现。</p> : <p>尚无再次出现记录。</p>}</section>
      <div className="material-actions"><button className="btn btn-danger-ghost" type="button" onClick={() => onDelete(asset.assetId)}>删除思考</button></div>
    </div>
  </details>;
}

function LegacyArgumentAssetCard({ asset, packs, onDelete, onOpenSource }: { asset: LegacyArgumentAsset; packs: TopicAssetPack[]; onDelete: (id: string) => void; onOpenSource: (id: string) => void }) {
  const sourceIds = argumentAssetSourceDocumentIds(asset, packs);
  return <details className="material-card argument-card argument-asset-card"><summary><span><small>旧版只读记录</small><strong>{argumentAssetPrinciple(asset)}</strong><time>来源 {sourceIds.length} 篇</time></span></summary><div className="pack-content"><p className="legacy-expression-badge">旧结构原样保留，不补造长期思考，也不参与写前召回。</p>{sourceIds.map(id => <button className="text-button" type="button" key={id} onClick={() => onOpenSource(id)}>查看来源作文</button>)}<div className="material-actions"><button className="btn btn-danger-ghost" type="button" onClick={() => onDelete(asset.assetId)}>删除旧记录</button></div></div></details>;
}

export function MaterialsDialog({ assets, usages, packs, onEdit, onDeleteAsset, onDeleteLegacy, onOpenSource, onClose }: { assets: ArgumentAsset[]; usages: ArgumentAssetUsage[]; packs: TopicAssetPack[]; onEdit: (id: string, value: ThoughtAssetUpdate) => void; onDeleteAsset: (id: string) => void; onDeleteLegacy: (id: string) => void; onOpenSource: (documentId: string) => void; onClose: () => void; initialPackId?: string | null; initialRevision?: number }) {
  const linkedDocuments = new Set(assets.flatMap(asset => argumentAssetSourceDocumentIds(asset, packs)));
  const historical = packs.filter(pack => !linkedDocuments.has(pack.sourceDocumentId));
  return <DialogFrame title="我的素材" subtitle={`${assets.filter(asset => asset.kind === 'thought').length} 条长期思考`} onClose={onClose} className="materials-dialog"><div className="dialog-body workflow-dialog-body">
    <section className="argument-library" aria-labelledby="argument-library-title"><div className="material-section-heading"><h3 id="argument-library-title">什么问题会让我想起它</h3><p>先看触发情形和可迁移判断；原作文只在展开后作为证据。</p></div>{assets.length ? <div className="material-list">{assets.map(asset => asset.kind === 'thought' ? <ThoughtAssetCard key={asset.assetId} asset={asset} usages={usages} packs={packs} onEdit={onEdit} onDelete={onDeleteAsset} onOpenSource={onOpenSource} /> : <LegacyArgumentAssetCard key={asset.assetId} asset={asset} packs={packs} onDelete={onDeleteAsset} onOpenSource={onOpenSource} />)}</div> : <div className="workflow-empty">还没有长期思考。完成一篇文章后，由你决定是否保存。</div>}</section>
    {historical.length ? <details className="source-background"><summary>其他历史素材（{historical.length}）</summary><div className="material-list">{historical.map(pack => <details className="material-card source-card" key={pack.id}><summary><span><small>历史记录</small><strong>{pack.sourceTitle}</strong><p>{pack.sourcePrompt}</p></span></summary><div className="pack-content"><p className="legacy-expression-badge">历史数据原样保留，不展示旧节点结构。</p><details><summary>查看保存时的来源全文</summary><p className="source-essay">{pack.sourceEssaySnapshot}</p></details></div><div className="material-actions"><button className="btn btn-secondary" type="button" onClick={() => onOpenSource(pack.sourceDocumentId)}>查看来源作文</button><button className="btn btn-danger-ghost" type="button" onClick={() => onDeleteLegacy(pack.id)}>删除历史素材记录</button></div></details>)}</div></details> : null}
  </div></DialogFrame>;
}

export type RecallSession = { status: 'loading' | 'ready' | 'error'; matches: ArgumentAssetRecallMatch[]; error: string | null };
export function RecallDialog({ session, assets, onRetry, onOpenSource, onClose }: { session: RecallSession; assets: ArgumentAsset[]; onRetry: () => void; onOpenSource: (documentId: string) => void; onClose: () => void }) {
  const byId = new Map(assets.filter((asset): asset is ThoughtAsset => asset.kind === 'thought').map(asset => [asset.assetId, asset]));
  return <DialogFrame title="想起过去的积累" subtitle="这里展示的是你过去保存的内容，不是针对当前题生成的分析。" onClose={onClose} className="materials-dialog"><div className="dialog-body workflow-dialog-body">
    {session.status === 'loading' ? <div className="workflow-state" role="status"><span className="spinner" aria-hidden="true" /><p>正在查找过去可能相关的积累…</p></div> : null}
    {session.status === 'error' ? <div className="workflow-state error-card" role="alert"><p>{session.error}</p><button className="btn btn-secondary" type="button" onClick={onRetry}>重新查找</button></div> : null}
    {session.status === 'ready' ? session.matches.length ? <div className="material-list">{session.matches.map(match => { const asset = byId.get(match.assetId); if (!asset) return null; const sources = [...new Map(asset.sources.map(source => [source.documentId, source])).values()]; return <article className="material-card recall-asset-card" key={asset.assetId}><small>为什么想起它</small><strong>{asset.useWhen ?? asset.thought}</strong>{asset.useWhen ? <section><h4>过去形成的判断</h4><p>{asset.thought}</p></section> : null}{asset.rationale ? <section><h4>为什么成立</h4><p>{asset.rationale}</p></section> : null}<section><h4>来源</h4>{sources.map(source => <div className="recall-source-row" key={source.documentId}><p>{source.sourceTitle}</p><button type="button" onClick={() => onOpenSource(source.documentId)}>查看原文</button></div>)}</section></article>; })}</div> : <div className="workflow-empty">目前还没有相关积累，请积极探索。</div> : null}
  </div></DialogFrame>;
}



