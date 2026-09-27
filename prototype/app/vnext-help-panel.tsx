'use client';

import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import type { HelpPackage, HelpItem } from './help-package';
import type { HelpExposure } from './workspace-state';

export function ExposureBlock({ enabled, onVisible, children, fullyVisible = false, onPartial }: { enabled: boolean; onVisible: () => void; children: ReactNode; fullyVisible?: boolean; onPartial?: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const report = useEffectEvent(onVisible);
  const reportPartial = useEffectEvent(() => onPartial?.());
  useEffect(() => {
    if (!enabled || !element.current) return;
    let visible = false, complete = false;
    const notify = () => { if (visible && document.visibilityState === 'visible') { if (!fullyVisible || complete) report(); else reportPartial(); } };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; complete = entries[0].intersectionRatio >= 1; notify(); }, { threshold: fullyVisible ? [0, 1] : 0 });
    observer.observe(element.current);
    document.addEventListener('visibilitychange', notify);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', notify); };
  }, [enabled, fullyVisible]);
  return <div ref={element}>{children}</div>;
}

export function VNextHelpPanel({ pack, revealed, enabled, onReveal, onExposure }: {
  pack: HelpPackage;
  revealed: string[];
  enabled: boolean;
  onReveal: (key: string) => void;
  onExposure: (item: HelpItem, kind: HelpExposure['kind'], content: string, scaffoldId?: string) => void;
}) {
  return <div className="result-stack">{pack.items.map(item => <div className="result-group" key={item.itemId}>
    <div className="source-row"><span>原中文</span><p>{item.sourceZh}</p></div>
    <section className="result-card" aria-label="表达支架">
      {item.kind === 'saved' ? <>
        <span className="material-note">来自你保存的表达</span>
        <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'saved_chinese', item.meaningZh)}><p>{item.meaningZh}</p></ExposureBlock>
        <button className="btn btn-secondary" type="button" aria-expanded={revealed.includes(item.itemId)} onClick={() => onReveal(item.itemId)}>{revealed.includes(item.itemId) ? '已显示英文' : '直接看表达'}</button>
        {revealed.includes(item.itemId) ? <>
          <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'saved_english', [item.expression, item.conditions].filter(Boolean).join('\n'))}><div className="direct-expression"><strong>{item.expression}</strong><p>{item.conditions}</p></div></ExposureBlock>
          <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'saved_source', item.sourceQuote)}><blockquote>{item.sourceQuote}</blockquote></ExposureBlock>
        </> : null}
      </> : item.scaffold.action === 'provide_expression' ? <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'new_direct', item.scaffold.recommendedExpression!)}><div className="direct-expression"><span>表达支架</span><strong>{item.scaffold.recommendedExpression}</strong><p>请自行调整词形和接入方式。</p></div></ExposureBlock> : <>
        <p className="material-note">按需揭示英文，由你自行组合。</p>
        <div className="scaffold-list">{item.scaffold.scaffolds.map(s => {
          const key = `${item.itemId}:${s.scaffoldId}`, visible = revealed.includes(key);
          return <div className={'scaffold-item' + (visible ? ' revealed' : '')} key={s.scaffoldId}>
            <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'new_focus', s.focusZh, s.scaffoldId)}><button className="scaffold-row" type="button" aria-expanded={visible} onClick={() => onReveal(key)}><span className="focus-zh">{s.focusZh}</span><span className="reveal-action">{visible ? '已揭示' : '显示英文 →'}</span></button></ExposureBlock>
            {visible ? <ExposureBlock enabled={enabled} onVisible={() => onExposure(item, 'new_scaffold', s.recommendedExpression, s.scaffoldId)}><div className="revealed-expression" role="status">{s.recommendedExpression}</div></ExposureBlock> : null}
          </div>;
        })}</div>
      </>}
    </section>
  </div>)}</div>;
}
