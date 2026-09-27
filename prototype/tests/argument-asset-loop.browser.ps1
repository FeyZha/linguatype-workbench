param([string]$BaseUrl = 'http://127.0.0.1:4173', [string]$Evidence = '../../docs/verification/thought-recall-browser-20260915')
$ErrorActionPreference = 'Stop'
$sessionName = 'thought-recall-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Evidence))
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
$checks = [Collections.Generic.List[string]]::new()
function Browser([string[]]$Arguments) {
  & npx.cmd --no-install agent-browser --session $sessionName @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Browser command failed: $($Arguments -join ' ')" }
}
$helpers = @'
const ws=()=>JSON.parse(localStorage.getItem('linguatype:demo:v4:linguatype:workspace:v2'));
const current=()=>ws().documents.find(d=>d.documentId===ws().activeDocumentId);
const assert=(v,m)=>{if(!v)throw new Error(m)};
const wait=async(f,m='timeout')=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,100))}throw new Error(m)};
const button=t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t);
const click=async t=>{const b=button(t);assert(b&&!b.disabled,'Unavailable: '+t);b.click();await new Promise(r=>setTimeout(r,100))};
const fill=async(el,v)=>{assert(el,'Missing field');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100))};
const closeDialog=async()=>{const b=document.querySelector('dialog[open] .support-close');assert(b,'No dialog close');b.click();await new Promise(r=>setTimeout(r,100))};
const newEssay=async prompt=>{await click('新建作文');await click('自己输入题目');await fill(document.querySelector('#custom-prompt'),prompt);await click('创建作文');await wait(()=>current().taskPrompt===prompt)};
if(!window.__thoughtRecallFetch)window.__thoughtRecallFetch=window.fetch.bind(window);
window.fetch=async(url,options)=>{
 const path=String(url),body=options?.body?JSON.parse(options.body):{};
 if(path!=='/api/argument-asset-recall')return window.__thoughtRecallFetch(url,options);
 const asset=(body.assets||[]).find(item=>item.kind==='thought'&&item.thought.includes('平均效率'));
 const matches=body.taskPrompt.includes('Universities')&&asset?[{assetId:asset.assetId}]:[];
 return new Response(JSON.stringify({version:3,matches,meta:{model:'browser-stub',promptVersion:'thought-recall-v1-existing-id-only',callCount:1,latencyMs:1}}),{status:200,headers:{'content-type':'application/json'}});
};
'@
function Check([string]$Name,[string]$Body) {
  Write-Output "RUN $Name"
  $script='(async()=>{'+$helpers+"`n"+$Body+";return 'PASS';})()"
  $result=$script | & npx.cmd --no-install agent-browser --session $sessionName eval --stdin 2>&1
  if($LASTEXITCODE -ne 0 -or ($result-join'') -notmatch 'PASS'){throw($Name+': '+($result-join"`n"))}
  $checks.Add($Name); Write-Output "PASS $Name"
}
try {
  Browser @('open', "$BaseUrl/?demo=1")
  "localStorage.removeItem('linguatype:demo:v4:linguatype:workspace:v2');sessionStorage.clear();location.reload();'RESET'" | & npx.cmd --no-install agent-browser --session $sessionName eval --stdin | Out-Null
  Start-Sleep -Milliseconds 800
  Check 'Related history is a memory reminder only' @'
await wait(()=>button('积累召回'));
assert(current().essay==='','Demo must start before the user writes an argument');
await click('积累召回');
await wait(()=>document.querySelector('.recall-asset-card'));
const text=document.querySelector('dialog[open]').textContent;
assert(text.includes('提高平均效率')&&text.includes('公共服务数字化'),'Saved thought or source missing');
for(const forbidden of ['本题可以','这次可以这样使用','当前题如何替换角色','加入本篇思路'])assert(!text.includes(forbidden),'Current-task guidance leaked: '+forbidden);
assert(document.querySelector('#essay').value==='','Recall changed the essay');
'@
  Browser @('screenshot', (Join-Path $evidencePath '01-related.png'))
  Check 'Source opens without applying anything to the draft' @'
await click('查看来源');
await wait(()=>current().documentId==='demo-digital-services');
assert(!document.querySelector('dialog[open]'),'Recall dialog stayed open');
'@
  Check 'No history leaves thinking to the user' @'
await newEssay('Some people think governments should spend money on space exploration, while others believe it should support the arts. Discuss both views.');
await click('积累召回');
await wait(()=>document.querySelector('dialog[open] .workflow-empty'));
const text=document.querySelector('dialog[open]').textContent.replace(/\s+/g,' ').trim();
assert(text.includes('目前还没有相关积累，请积极探索。'),'Exact empty state missing');
assert(!document.querySelector('.recall-asset-card'),'Unexpected advice in empty state');
assert(document.querySelector('#essay').value==='','Empty recall changed the essay');
'@
  Browser @('screenshot', (Join-Path $evidencePath '02-empty.png'))
  @{checkedAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks.ToArray();mode='Isolated demo browser with deterministic recall transport';personalWorkspaceTouched=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $evidencePath 'browser-results.json') -Encoding utf8
  Write-Output "Passed $($checks.Count) browser scenarios. Evidence: $evidencePath"
} finally { Browser @('close') }
