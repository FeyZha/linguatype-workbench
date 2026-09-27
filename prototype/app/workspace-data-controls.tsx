'use client';
import { useRef, useState } from 'react';
import { BACKUP_LIMIT, readWorkspaceBackup } from './workspace-data';
import type { PersistedWorkspace } from './workspace-state';

export function WorkspaceDataControls({ onReplace }: { onReplace: (workspace: PersistedWorkspace | null) => Promise<void> }) {
  const [backup, setBackup] = useState<PersistedWorkspace | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selection = useRef(0);
  async function apply(value: PersistedWorkspace | null) {
    if (!window.confirm(value ? '用选中的备份替换本设备全部作文、素材和记录？其他窗口中尚未导出的内容也会被替换。建议先导出当前资料。' : '永久清空本设备全部作文、素材、来源摘录及行为记录，包括其他窗口和冲突副本？已下载的备份文件需自行删除。')) return;
    setBusy(true); setError('');
    try { await onReplace(value); }
    catch { setError('未能完成数据操作，请保留备份并检查本设备存储后重试。'); setBusy(false); }
  }
  return <details className="material-form"><summary>导入或清空本设备资料</summary>
    <p>导入会替换整份资料，不合并、不新增学习事件；只恢复备份中的主副本。先使用上方导出按钮保留需要的内容。</p>
    <label>选择 LinguaType JSON 备份<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
      const file = event.currentTarget.files?.[0], token = ++selection.current;
      setBackup(null); setError(''); if (!file) return;
      try {
        if (file.size > BACKUP_LIMIT) throw new Error('TOO_LARGE');
        const next = readWorkspaceBackup(await file.text());
        if (token === selection.current) setBackup(next);
      } catch { if (token === selection.current) setError('备份格式或内容不完整，或超过20MB；当前资料未被替换。'); }
    }} /></label>
    {backup ? <p>已校验：{backup.documents.length} 篇作文，{backup.assetLibrary?.assets.length ?? 0} 条语言素材，{backup.assetLibrary?.ideas?.length ?? 0} 条观点素材，{backup.assetLibrary?.reasons?.length ?? 0} 条理由链素材。</p> : null}
    <div className="material-toolbar"><button type="button" className="btn btn-secondary" disabled={!backup || busy} onClick={() => void apply(backup)}>用此备份替换本设备资料</button>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void apply(null)}>清空本设备全部资料</button></div>
    {busy ? <p role="status">正在处理本设备资料…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
