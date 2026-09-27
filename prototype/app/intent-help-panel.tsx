'use client';

import { ExposureBlock, VNextHelpPanel } from './vnext-help-panel';
import type { EssayDocument, HelpExposure } from './workspace-state';
import type { HelpItem } from './help-package';
import type { IntentCard, IntentDraft } from './intent-help-state';
import { findSentences } from './sentence-tracking';

export function IntentHelpPanel({ document, saved, enabled, onDraft, onRequest, onSelect, onNew, onSkip, onReveal, onExposure, onContext, onPaste, onIncomplete }: {
  document: EssayDocument; saved: boolean; enabled: boolean;
  onDraft: (draft: IntentDraft) => void;
  onRequest: (retry?: IntentCard) => void;
  onSelect: (id: string) => void; onNew: () => void; onSkip: (id: string) => void;
  onReveal: (card: IntentCard, key: string) => void;
  onExposure: (card: IntentCard, item: HelpItem, kind: HelpExposure['kind'], content: string, scaffoldId?: string) => void;
  onContext: (card: IntentCard, key: string, content: string) => void;
  onPaste: (content: string) => void;
  onIncomplete: () => void;
}) {
  const draft = document.intentDraft ?? { intentZh: '', englishAttempt: '' };
  const cards = document.intentCards ?? [], card = cards.find(c => c.cardId === document.activeIntentId);
  return <div className="intent-help">
    <p>描述这一个句子里想表达的意思。正文可以为空，支架由你自行取舍和接入。</p>
    <form onSubmit={event => { event.preventDefault(); onRequest(); }}>
      <label>中文意图<textarea rows={3} required maxLength={1500} value={draft.intentZh} onChange={e => onDraft({ ...draft, intentZh: e.target.value })} placeholder="例如：帮助员工适应不断变化的工作要求" /></label>
      <label>已有英文尝试（可以不填）<textarea rows={3} maxLength={3000} value={draft.englishAttempt} onPaste={e => onPaste(e.clipboardData.getData('text/plain'))} onChange={e => onDraft({ ...draft, englishAttempt: e.target.value })} placeholder="例如：Employers can" spellCheck={false} /></label>
      {!document.taskPrompt.trim() ? <p role="status">请先选择或填写雅思题目。</p> : null}
      {!saved ? <p role="status">本设备保存尚未完成，保存成功后可求助。</p> : null}
      <div className="completion-actions"><button className="btn btn-primary" type="submit" disabled={!saved || !document.taskPrompt.trim() || !draft.intentZh.trim() || card?.status === 'loading'}>获取表达支架</button><button className="btn btn-secondary" type="button" onClick={onNew}>新的卡点</button></div>
    </form>
    {cards.length ? <label>回看本篇求助<select value={document.activeIntentId ?? ''} onChange={e => onSelect(e.target.value)}><option value="">当前草稿</option>{cards.map((c, i) => <option value={c.cardId} key={c.cardId}>第 {i + 1} 次 · {c.request.targetSentence.slice(0, 30)} · {c.status === 'loading' ? '准备中' : c.status === 'error' ? '未完成' : '已准备'}</option>)}</select></label> : null}
    {card ? <section aria-label="本次求助记录">
      <h3>本次结果：{card.request.targetSentence}</h3>
      <p className="material-note">结果绑定这次求助记录。修改上方草稿会开始一个新版本，正文不会被替换。</p>
      <details onToggle={e => { if (e.currentTarget.open) onIncomplete(); }}><summary>查看这次求助的题目、尝试与正文</summary><p>{card.request.taskPrompt}</p>
        {([['attempt', card.intent.englishAttempt], ['essay', card.request.essay]] as const).map(([key, content]) => <div className="completion-source" key={key}>{content ? findSentences(content).map(s => <ExposureBlock key={`${card.requestToken}:${key}:${s.start}`} fullyVisible enabled={enabled} onVisible={() => onContext(card, `${key}:${s.start}`, s.text)}>{s.text}</ExposureBlock>) : <p>{key === 'attempt' ? '这次没有填写英文尝试。' : '这次求助时，正文为空。'}</p>}</div>)}
      </details>
      {card.status === 'loading' ? <div role="status"><p>{card.phase === 'searching' ? '正在查找适用的旧表达。' : '正在准备表达支架。'}你可以返回正文继续写。</p>{card.phase === 'searching' ? <button className="btn btn-secondary" type="button" onClick={() => onSkip(card.cardId)}>直接获取支架</button> : null}</div> : null}
      {card.status === 'error' ? <div role="alert"><p>{card.error}</p><button className="btn btn-secondary" type="button" disabled={!saved} onClick={() => onRequest(card)}>重试这次求助</button></div> : null}
      {card.status === 'ready' && card.helpPackage ? <>
        {['skipped', 'timeout', 'unavailable'].includes(card.retrieval?.outcome ?? '') ? <p className="material-note">{card.retrieval?.outcome === 'skipped' ? '已跳过旧表达查找。' : '旧表达未及时取得，本次已准备新支架。'}</p> : null}
        <VNextHelpPanel key={card.requestToken} pack={card.helpPackage} revealed={card.revealedScaffolds} enabled={enabled} onReveal={key => onReveal(card, key)} onExposure={(item, kind, content, scaffoldId) => onExposure(card, item, kind, content, scaffoldId)} />
      </> : null}
    </section> : null}
  </div>;
}
