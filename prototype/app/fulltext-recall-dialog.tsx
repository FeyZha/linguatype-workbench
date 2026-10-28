'use client';
import {useEffect,useRef} from 'react';
import type {ConfirmedEssay,ReusePath} from './fulltext-recall';

export type FulltextRecallSession={status:'loading'|'ready'|'error';paths:ReusePath[];essays:ConfirmedEssay[];error:string|null};
export function FulltextRecallDialog({session,onClose,onRetry}:{session:FulltextRecallSession;onClose:()=>void;onRetry:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const trigger=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>trigger?.focus();},[]);
 return <dialog ref={ref} className="workflow-dialog materials-dialog" aria-labelledby="fulltext-recall-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header className="dialog-header workflow-dialog-header"><div><h2 id="fulltext-recall-title">从旧文找到复用线索</h2><p>旧观点、来源原句和改动方向。观点如何组织，由你决定。</p></div><button className="support-close" type="button" aria-label="关闭旧文线索" onClick={onClose}>×</button></header>
  <div className="dialog-body workflow-dialog-body">
   {session.status==='loading'?<div className="workflow-state" role="status"><span className="spinner" aria-hidden="true"/><p>正在阅读已确认的历史全文…可以关闭后继续写作。</p></div>:null}
   {session.status==='error'?<div className="workflow-state error-card" role="alert"><p>{session.error}</p><button className="btn btn-secondary" type="button" onClick={onRetry}>重新查找</button></div>:null}
   {session.status==='ready'&&!session.paths.length?<div className="workflow-empty">{session.essays.length?'这次没有找到合适的旧文线索，可以从自己的想法写起。':'还没有可用的已确认历史作文。先完成并确认一篇，之后便可复用。'}</div>:null}
   {session.status==='ready'?<div className="material-list">{session.paths.map((path,index)=>{
    const source=path.sources[0],essay=session.essays[Number(source.essay_id.slice(1))-1];
    return <article className="material-card recall-asset-card" key={`${source.essay_id}:${index}`}>
     <small>线索 {index+1}</small><section><h4>旧观点</h4><p>{path.old_point}</p></section>
     <section><h4>来源原句</h4><blockquote>{source.quote}</blockquote></section>
     <section><h4>改动方向</h4><p>{path.adaptation_direction}</p></section>
     {essay?<details><summary>查看已确认原文 · {essay.title}</summary><p className="completion-meta">确认时间：{new Date(essay.confirmedAt).toLocaleString('zh-CN')}</p><div className="source-essay">{essay.text}</div></details>:null}
    </article>;
   })}</div>:null}
  </div>
 </dialog>;
}
