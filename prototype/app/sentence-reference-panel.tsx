'use client';

import { useState } from 'react';
import { ExposureBlock } from './vnext-help-panel';
import { referenceKey, type ReferenceInput, type ReferenceRecord } from './sentence-reference';

export function SentenceReferencePanel({ input, records, saved, enabled, onRequest, onVisible, onIncomplete, onContinue }: {
  input: ReferenceInput; records: ReferenceRecord[]; saved: boolean; enabled: boolean;
  onRequest: (input: ReferenceInput) => void; onVisible: (record: ReferenceRecord) => void;
  onIncomplete: () => void; onContinue: (record: ReferenceRecord, continued: boolean) => void;
}) {
  const [historyId, setHistoryId] = useState('');
  const current = records.find(r => referenceKey(r.input) === referenceKey(input));
  const record = records.find(r => r.referenceId === historyId) ?? current;
  return <section className="sentence-reference" aria-label="主动单句参考">
    <p className="material-note">需要更强帮助时，可查看一个完整句，由你决定是否采用。</p>
    <button className="btn btn-secondary" type="button" disabled={!saved || !input.taskPrompt.trim() || !input.target.trim() || current?.status === 'loading'} onClick={() => { setHistoryId(''); onRequest(input); }}>{current?.status === 'ready' ? '查看已保存的本句参考' : current?.status === 'loading' ? '正在准备本句参考' : '仍然卡住，查看本句参考'}</button>
    {records.length > 0 ? <details><summary>回看本篇参考记录</summary><label>选择参考记录<select value={historyId || current?.referenceId || ''} onChange={e => setHistoryId(e.target.value)}><option value="">当前意图</option>{records.map((r, i) => <option key={r.referenceId} value={r.referenceId}>第 {i + 1} 次 · {r.input.target.slice(0, 30)}</option>)}</select></label></details> : null}
    {record ? <div key={record.requestToken}>
      <p className="material-note">原意：{record.input.target}</p>
      {record.status === 'loading' ? <p role="status">正在准备，你可以继续写作。</p> : null}
      {record.status === 'error' ? <div role="alert"><p>这次没有取得参考，原输入和正文已保留。</p><button className="btn btn-secondary" disabled={!saved} onClick={() => onRequest(record.input)}>重试这次参考</button></div> : null}
      {record.response?.result.kind === 'clarification' ? <><p>{record.response.result.questionZh}</p><p className="material-note">请在中文意图或正文目标句中补充，再主动请求参考。</p></> : null}
      {record.response?.result.kind === 'reference' ? <>
        <ExposureBlock enabled={enabled} fullyVisible onPartial={onIncomplete} onVisible={() => onVisible(record)}><blockquote className="completion-source">{record.response.result.sentence}</blockquote></ExposureBlock>
        <p className="material-note">这是完整句参考，模型参与了组句；不会写回正文。</p>
        <label className="material-confirm"><input type="checkbox" checked={record.continued} onChange={e => onContinue(record, e.target.checked)} />我已继续写作</label>
        <p className="material-note">这里只记录你的反馈；最终表达是否合适仍需写后核对。</p>
      </> : null}
    </div> : null}
  </section>;
}
