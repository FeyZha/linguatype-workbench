'use client';
import type { WritingCompletion } from './writing-completion';
import type { TraceAsset } from './writing-trace';
import { usageObservation, type UsageReview } from './writing-usage';
import { countReusedDocuments, type ReuseObservation } from './usage-attribution';
import { ExposureBlock } from './vnext-help-panel';

const assistance = { unprompted_observed: '记录中，相关提示前已观察到这处表达', chinese: '此前展示过相关中文提醒', english: '此前展示过相关英文帮助', full_reference: '此前展示过完整句参考', unknown: '提示先后或来源依据不足' };
const verdict = { appropriate: '素材用法合适', inappropriate: '尝试采用，但用法不合适', alternate: '用了另一种表达', absent: '本稿未观察到使用', unknown: '当前含义无法确认' };
export function WritingUsagePanel({ completion, assets, observations, saved, onAnalyze, onCorrect, onExposure }: {
  completion: WritingCompletion; assets: TraceAsset[]; observations: ReuseObservation[]; saved: boolean;
  onAnalyze: (asset: TraceAsset) => void; onCorrect: (assetId: string, correction: UsageReview['correction'], note?: string) => void;
  onExposure: (key: string, content: string, level: 'chinese' | 'english' | 'full_reference', asset?: TraceAsset) => void;
}) {
  return <section aria-labelledby="usage-title">
    <h3 id="usage-title">回看旧素材在本稿中的使用</h3>
    <p>逐条核对，保留正文与此前帮助的依据。未核对的素材不进入统计；这些记录不代表掌握或学习进步。</p>
    {!completion.writingTrace ? <p>这份旧稿缺少完整过程记录：可核对正文，提示来源与写作开始时的素材版本保持未知。</p> : null}
    {!assets.length ? <p>暂无可核对的已通过来源检查的语言素材。</p> : null}
    {assets.map(asset => {
      const review = completion.usageReviews?.find(r => r.asset.assetId === asset.assetId && r.asset.revision === asset.revision);
      const observation = review ? usageObservation(review) : null;
      const result = review?.result;
      return <article className="material-card" key={`${asset.assetId}:${asset.revision}`}>
        <ExposureBlock enabled onVisible={() => onExposure(`meaning:${asset.assetId}:${asset.revision}`, asset.meaningZh, 'chinese', asset)}><h4>{asset.meaningZh}</h4></ExposureBlock>
        <p className="material-note">第 {asset.revision} 版 · 已核对的不同作文中，合适使用 {countReusedDocuments(observations, asset.assetId, asset.revision)} 篇；同篇多次完成只计一篇。</p>
        {review?.status === 'loading' ? <p role="status">正在核对正文和已记录的帮助；可以返回写作，结果只归入这个完成版本。</p> : <button type="button" className="btn btn-secondary" disabled={!saved} onClick={() => onAnalyze(asset)}>{review?.status === 'error' ? '重新核对这条' : review?.status === 'ready' ? '重新核对' : '核对这条素材'}</button>}
        {review?.status === 'error' ? <p role="alert">本次未完成，暂不计入结论。正文不受影响；可重试。</p> : null}
        {review?.status === 'ready' && result && observation ? <>
          <ExposureBlock enabled onVisible={() => onExposure(`result:${review.attemptId}`, [asset.expression, result.quote].filter(Boolean).join('\n'), 'english', asset)}>
            <p><strong>{verdict[result.verdict]}</strong> · {asset.expression}</p>
            <p>{result.reasonZh}</p>
            {result.quote ? <blockquote className="completion-source">{result.quote}</blockquote> : null}
          </ExposureBlock>
          {observation.finalExpression ? <p>{assistance[observation.finalExpression.assistance]}。这是展示记录，不能证明你是否实际采用了提示。</p> : null}
          {observation.eligibility !== 'yes' ? <p>{observation.eligibility === 'unknown' ? '无法确认写作开始时的素材版本' : asset.sourceDocumentId === observation.documentId ? '这条素材来自本篇作文' : '本篇开始时尚未保存这条素材的当前版本'}，不计跨篇复用。</p> : null}
          <p>历史卡点表达：{observation.basis === 'self_reported_known' ? '你标记为原先就会，单列，不作新学会的证据。' : observation.basis === 'prior_help_observed' ? '来源稿曾为相同中文含义请求支架，并展示过这条英文；另一种正确表达单独保留，不计原素材复用。' : '原先是否卡住尚无可靠关联记录，保留未知。另一种表达不冒算素材复用或卡点改善。'}</p>
          {review.historicalHelp ? <details><summary>查看来源求助依据</summary><p>当时求助含义：{review.historicalHelp.meaningZh}</p><p>当时展示英文：{review.historicalHelp.expression}</p><p>展示时间：{new Date(review.historicalHelp.shownAt).toLocaleString('zh-CN')}</p><ExposureBlock enabled onVisible={() => onExposure('history:' + review.attemptId, asset.sourceQuote, 'english', asset)}><blockquote>{asset.sourceQuote}</blockquote></ExposureBlock></details> : null}
          {observation.earlierExpression && observation.earlierExpression.evidenceId !== observation.finalExpression?.evidenceId ? <ExposureBlock enabled onVisible={() => onExposure('earlier:' + review.attemptId, observation.earlierExpression!.quote, 'english', asset)}><p>更早还观察到：“{observation.earlierExpression.quote}”。{assistance[observation.earlierExpression.assistance]}；与最终措辞分别保留。</p></ExposureBlock> : null}
          <details><summary>展开提示依据与顺序</summary>
            <p>本次核对共完成 {review.callCount} 次模型调用；展开、纠正和计数在本设备完成。</p>
            {review.modelCalls ? <p>分析版本：{[...new Set(review.modelCalls.map(m => m.promptVersion + ' · ' + m.model))].join('；')}</p> : <p>旧记录未保留分析版本，不据此比较不同模型效果。</p>}
            {!review.evidence?.traceComplete ? <p>过程记录不完整，不能据此认定没有相关帮助。</p> : null}
            {review.evidence?.events.length ? <ol>{review.evidence.events.map((e, eventIndex) => <li key={e.eventId}>顺序 {e.order ?? '未知'} · {e.kind === 'exposure' ? assistance[e.level] : '粘贴或外部内容，来源未知'} · {e.relation === 'yes' ? '内容相关' : e.relation === 'no' ? '内容不相关' : '相关性未知'}<ExposureBlock enabled onVisible={() => onExposure('event:' + review.attemptId + ':' + eventIndex, e.content, e.level, assets.find(a => completion.writingTrace?.events.some(t => t.eventId === e.eventId && t.assetId === a.assetId && t.revision === a.revision)))}><blockquote>{e.content}</blockquote></ExposureBlock></li>)}</ol> : <p>当前没有可展示的相关过程条目。</p>}
          </details>
          <label>纠正这条记录<select value={review.correction} onChange={event => onCorrect(asset.assetId, event.target.value as UsageReview['correction'])}>
            <option value="none">保留系统记录</option><option value="exclude">判断不准确，撤出统计</option><option value="external">使用过外部帮助，来源按未知处理</option><option value="known">这条表达我原先就会</option>
          </select></label>
          <details><summary>补充说明（可选）</summary><label>例如：不是这个意思、用法不合适或帮助来源<textarea maxLength={500} value={review.correctionNote ?? ''} onChange={e => onCorrect(asset.assetId, review.correction, e.target.value)} /></label></details>
          {review.correction === 'exclude' ? <p>已撤出统计，原始依据仍可核对。</p> : null}
        </> : null}
      </article>;
    })}
  </section>;
}
