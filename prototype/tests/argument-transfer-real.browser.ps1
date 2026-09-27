param([string]$BaseUrl = 'http://127.0.0.1:4173', [string]$Evidence = '../../docs/verification/argument-transfer-real-20260913')
$ErrorActionPreference = 'Stop'
$sessionName = 'argument-transfer-real-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Evidence))
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
function Browser([string[]]$Arguments) {
  if ($Arguments[0] -eq 'open') { & npx.cmd --no-install agent-browser --session $sessionName open $Arguments[1] }
  elseif ($Arguments[0] -eq 'screenshot') { & npx.cmd --no-install agent-browser --session $sessionName screenshot $Arguments[1] }
  elseif ($Arguments[0] -eq 'close') { & npx.cmd --no-install agent-browser --session $sessionName close }
  if ($LASTEXITCODE -ne 0) { throw "Browser command failed: $($Arguments -join ' ')" }
}
$helpers = @'
const key='linguatype:workspace:v2';
const ws=()=>JSON.parse(localStorage.getItem(key));
const current=()=>ws().documents.find(d=>d.documentId===ws().activeDocumentId);
const latest=()=>{const a=current().completedVersions||[];return a[a.length-1]};
const assert=(v,m)=>{if(!v)throw new Error(m)};
const wait=async(f,m='timeout')=>{for(let i=0;i<900;i++){if(f())return;await new Promise(r=>setTimeout(r,100))}throw new Error(m)};
const button=t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t);
const click=async t=>{const b=button(t);assert(b&&!b.disabled,'Unavailable: '+t);b.click();await new Promise(r=>setTimeout(r,150))};
const fill=async(el,v)=>{assert(el,'Missing field');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,150))};
const closeDialog=async()=>{const b=document.querySelector('dialog[open] .support-close,dialog[open] .icon-button');assert(b,'No dialog close');b.click();await new Promise(r=>setTimeout(r,150))};
const newEssay=async(prompt)=>{await click('新建作文');await click('自己输入题目');await fill(document.querySelector('#custom-prompt'),prompt);await click('创建作文');await wait(()=>current().taskPrompt===prompt)};
const complete=async()=>{await click('定稿沉淀');await wait(()=>document.querySelector('dialog[open] input[type=checkbox]'));document.querySelector('dialog[open] input[type=checkbox]').click();await click('确认这版，开始整理');await wait(()=>button('作为新思维资产保存')||button('确认是这个思维模式的新实例')||document.querySelector('dialog[open] .workflow-state.error-card'),'deposit timeout');assert(!document.querySelector('dialog[open] .workflow-state.error-card'),'Deposit failed')};
'@
function Check([string]$Name,[string]$Body){Write-Output "RUN $Name";$script='(async()=>{'+$helpers+"`n"+$Body+";return 'PASS';})()";$result=$script|& npx.cmd --no-install agent-browser --session $sessionName eval --stdin 2>&1;if($LASTEXITCODE -ne 0 -or ($result-join'') -notmatch 'PASS'){throw($Name+': '+($result-join"`n"))};Write-Output "PASS $Name"}
try {
  Browser -Arguments @('open',"$BaseUrl/?demo=0")
  "localStorage.removeItem('linguatype:workspace:v2');sessionStorage.clear();location.reload();'RESET'"|& npx.cmd --no-install agent-browser --session $sessionName eval --stdin|Out-Null
  Start-Sleep -Milliseconds 700
  Check 'real essay A creates one structured asset' @'
await wait(()=>button('新建作文'));
await newEssay('Cities should charge drivers who enter congested centres. To what extent do you agree?');
await fill(document.querySelector('#essay'),'Road congestion imposes delays and pollution costs on people who may not drive. A congestion charge makes drivers face part of these wider social costs. When the extra cost is visible, unnecessary peak-hour journeys become less attractive, so some travellers switch modes or travel at another time. However, charging is fair only when reliable and affordable public transport is available. Cities should also protect low-income commuters who have no realistic alternative. Therefore, cities should use congestion charging to reduce excessive road use, but only alongside practical alternatives and targeted support.');
await complete();assert(button('作为新思维资产保存'),'New asset choice missing');await click('作为新思维资产保存');await click('确认保存这些素材');await wait(()=>button('查看本次素材'));assert(ws().argumentAssets.length===1,'Expected one long-term asset');const a=ws().argumentAssets[0];assert(a.abstraction&&a.abstraction.triggerZh&&a.abstraction.reasoningZh&&a.abstraction.adaptableRoles.length>=2,'Reasoning pattern missing');sessionStorage.setItem('real-asset-id',a.assetId);
'@
  Check 'real carbon-tax recall maps roles and returns to writing' @'
await closeDialog();await newEssay('Governments should introduce a carbon tax to reduce emissions. To what extent do you agree?');await click('找相关素材');await wait(()=>button('加入本篇思路')||document.querySelector('dialog[open] .workflow-empty')||document.querySelector('dialog[open] .workflow-state.error-card'),'recall timeout');assert(button('加入本篇思路'),'Expected cross-topic transfer was not returned');const text=document.querySelector('dialog[open]').textContent;assert(text.includes('拥堵')&&text.includes('碳'),'Old-to-new mapping missing');assert(text.includes('重新检查'),'Condition recheck missing');await click('加入本篇思路');await closeDialog();assert(document.body.textContent.includes('本篇调用的旧观点'),'Transfer did not return to writing');
'@
  Browser -Arguments @('screenshot',(Join-Path $evidencePath '01-real-carbon-transfer.png'))
  Check 'real essay B links a second occurrence to the same asset' @'
await fill(document.querySelector('#essay'),'Carbon emissions impose climate and health costs on society. A carbon tax makes producers and consumers face part of these wider costs through a visible price signal. Higher prices can discourage avoidable high-carbon choices and encourage cleaner alternatives. However, the policy is fair only when affordable low-carbon options exist and low-income households receive targeted support. Governments should therefore introduce a carbon tax together with practical alternatives and compensation.');await complete();assert(button('确认是这个思维模式的新实例'),'Original asset link missing');await click('确认是这个思维模式的新实例');await click('确认保存这些素材');await wait(()=>button('查看本次素材'));const id=sessionStorage.getItem('real-asset-id'),a=ws().argumentAssets.find(x=>x.assetId===id);assert(ws().argumentAssets.length===1,'Reuse created an isolated asset');assert(a.occurrenceIds.length===2&&a.usageCount===1,'Occurrence or usage not recorded');assert(ws().argumentAssetUsages.filter(u=>u.assetId===id).length===1,'Usage idempotency failed');await click('查看本次素材');assert(document.body.textContent.includes('来自 2 篇作文')&&document.body.textContent.includes('实际复用 1 次'),'Library aggregation missing');
'@
  Browser -Arguments @('screenshot',(Join-Path $evidencePath '02-real-two-occurrences.png'))
  Check 'real museum-price negative returns empty' @'
await closeDialog();await newEssay('Museums should charge high entrance fees to reduce visitor numbers. Do you agree?');await fill(document.querySelector('#essay'),'Higher ticket prices may reduce visitor numbers and raise revenue, but they can also restrict cultural access.');await click('找相关素材');await wait(()=>button('加入本篇思路')||document.querySelector('dialog[open] .workflow-empty')||document.querySelector('dialog[open] .workflow-state.error-card'),'negative recall timeout');assert(!document.querySelector('dialog[open] .workflow-state.error-card'),'Negative recall failed');assert(!button('加入本篇思路')&&document.querySelector('dialog[open] .workflow-empty'),'Surface-similar asset was incorrectly recalled');
'@
  Browser -Arguments @('screenshot',(Join-Path $evidencePath '03-real-museum-empty.png'))
  $result = @{model='deepseek-v4-flash';positive='congestion-charge to carbon-tax';negative='congestion-charge to museum-price';argumentAssets=1;occurrences=2;usageCount=1;personalWorkspaceTouched=$false;passed=$true}
  $result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $evidencePath 'browser-results.json') -Encoding utf8
  Write-Output "Passed real-model transfer browser flow. Evidence: $evidencePath"
} finally { Browser -Arguments @('close') }
