param([string]$BaseUrl='http://127.0.0.1:3002')
$ErrorActionPreference='Stop'
$sessionName='portfolio-guards'
$out=Join-Path $PSScriptRoot '../../docs/verification/portfolio-mvp-20260927/recall-guards.json'
& npx.cmd --no-install agent-browser --session $sessionName open "$BaseUrl/?demo=1" | Out-Null
if($LASTEXITCODE -ne 0){throw 'Browser unavailable'}
# An isolated demo profile only; allow the existing editable-title UI to be tested.
@'
const k='linguatype:demo:v4:linguatype:workspace:v2';const w=JSON.parse(localStorage.getItem(k));const d=w.documents.at(-1);w.activeDocumentId=d.documentId;d.taskPrompt='Universities are moving their services online. Discuss the advantages and disadvantages.';d.essay='';delete d.promptSource;localStorage.setItem(k,JSON.stringify(w));location.reload();'Prepared isolated demo'
'@ | & npx.cmd --no-install agent-browser --session $sessionName eval --stdin | Out-Null
Start-Sleep -Milliseconds 800
$script=@'
(async()=>{
const checks=[],tick=()=>new Promise(r=>setTimeout(r,80));
const assert=(v,m)=>{if(!v)throw Error(m)};
const button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
const ws=()=>JSON.parse(localStorage.getItem('linguatype:demo:v4:linguatype:workspace:v2'));
const before=JSON.stringify(ws().argumentAssets.map(a=>[a.assetId,a.usageCount]));
const originalEssay=document.querySelector('#essay').value;
const original=window.fetch.bind(window),pending=[];
window.fetch=(url,options)=>String(url)==='/api/argument-asset-recall'?new Promise(resolve=>pending.push({resolve,signal:options.signal,asset:JSON.parse(options.body).assets[0]})):original(url,options);
const answer=(index,status=200,matches=[])=>pending[index].resolve(new Response(JSON.stringify({version:3,matches,meta:{model:'browser-state-stub',promptVersion:'thought-recall-v22-current-question',callCount:1,latencyMs:1}}),{status,headers:{'content-type':'application/json'}}));
const start=async()=>{button('积累召回').click();await tick();};
const close=async()=>{document.querySelector('dialog[open] .support-close').click();await tick();};
const fill=async(el,v)=>{assert(el,'Missing editable field');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));await tick();};
try{
const trigger=button('积累召回');for(let n=0;n<5;n++)trigger.click();await tick();
assert(pending.length===1&&trigger.disabled,'Duplicate request or trigger enabled');
assert(document.querySelector('dialog[open] [role=status]'),'Missing loading');checks.push('loading and same-tick duplicate guard');
await close();assert(pending[0].signal.aborted,'Close did not abort');
await start();answer(1);await tick();assert(document.querySelector('.workflow-empty')?.textContent.includes('目前还没有相关积累'),'Empty not normal state');
answer(0,502);await tick();assert(document.querySelector('.workflow-empty')&&!document.querySelector('dialog[open] [role=alert]'),'Old failure overwrote newer result');checks.push('empty and late response cannot overwrite newer request');
await close();await start();answer(2,502);await tick();assert(document.querySelector('dialog[open] [role=alert]')&&!document.querySelector('.workflow-empty'),'Error disguised as empty');
button('重新查找').click();await tick();answer(3);await tick();assert(document.querySelector('.workflow-empty'),'Explicit retry failed');checks.push('error separated from empty and manual retry');
await close();assert(document.querySelector('#essay').value===originalEssay,'Dialog changed essay');checks.push('dialog close preserves body');
await start();await fill(document.querySelector('#essay'),'Temporary synthetic context change.');assert(!document.querySelector('dialog[open]')&&pending[4].signal.aborted,'Draft did not invalidate request');answer(4);await tick();assert(!document.querySelector('dialog[open]'),'Stale draft response reopened dialog');await fill(document.querySelector('#essay'),originalEssay);checks.push('draft change rejects stale result');
await start();await fill(document.querySelector('#task-prompt'),'A changed synthetic title.');assert(!document.querySelector('dialog[open]')&&pending[5].signal.aborted,'Title did not invalidate request');answer(5);await tick();assert(!document.querySelector('dialog[open]'),'Stale title response reopened dialog');checks.push('title change rejects stale result');
await start();const other=[...document.querySelectorAll('.document-item')].find(b=>b.getAttribute('aria-current')!=='true');assert(other,'Missing other document');other.click();await tick();assert(!document.querySelector('dialog[open]')&&pending[6].signal.aborted,'Document did not invalidate request');answer(6);await tick();assert(!document.querySelector('dialog[open]'),'Stale document response reopened dialog');checks.push('document switch rejects stale result');
await start();answer(7,200,[{assetId:pending[7].asset.assetId}]);await tick();assert(document.querySelector('.recall-asset-card'),'Existing asset not displayed');button('查看原文').click();await tick();assert(ws().activeDocumentId===pending[7].asset.sources[0].documentId,'Source navigation failed');
assert(JSON.stringify(ws().argumentAssets.map(a=>[a.assetId,a.usageCount]))===before,'Recall changed usageCount');checks.push('positive recall and source viewing do not record usage');
return {syntheticResponses:true,realModelCalls:0,checks,passed:checks.length,requests:pending.length};
}finally{window.fetch=original;}
})()
'@
$result=$script | & npx.cmd --no-install agent-browser --session $sessionName --json eval --stdin
$result | Set-Content -Encoding utf8 $out
if($LASTEXITCODE -ne 0 -or !($result | ConvertFrom-Json).success){throw "Recall guard regression failed: $result"}
Write-Output $result
