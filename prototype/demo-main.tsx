import { createRoot } from 'react-dom/client';
import App from './app/page';
import './app/globals.css';
if (new URLSearchParams(location.search).get('demo') === '0') location.replace('/?demo=1');
createRoot(document.getElementById('root')!).render(<><div style={{padding:'9px 20px',background:'#f4eadb',fontSize:12}} role="note">预制数据演示 · 无模型调用 · <a href="/?demo=1">写作场景</a> · <a href="/?demo=recall">命中与空结果</a> · <a href="/scenarios.html">测试场景说明</a></div><App/></>);
