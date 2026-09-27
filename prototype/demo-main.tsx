import { createRoot } from 'react-dom/client';
import App from './app/page';
import './app/globals.css';
import './demo-menu.css';
if (new URLSearchParams(location.search).get('demo') === '0') location.replace('/?demo=1');
createRoot(document.getElementById('root')!).render(<>
  <App/>
  <button className="demo-menu-trigger" popoverTarget="demo-menu" aria-label="演示场景与说明">演示 <span aria-hidden="true">ⓘ</span></button>
  <div id="demo-menu" popover="auto" className="demo-menu">
    <p>预制数据演示 · 无模型调用</p>
    <nav aria-label="演示场景">
      <a href="/?demo=1">写作场景 <span aria-hidden="true">↗</span></a>
      <a href="/?demo=recall">命中与空结果 <span aria-hidden="true">↗</span></a>
      <a href="/scenarios.html">测试场景说明 <span aria-hidden="true">↗</span></a>
    </nav>
  </div>
</>);
