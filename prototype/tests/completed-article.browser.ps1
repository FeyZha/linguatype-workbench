param([string]$BaseUrl = 'http://127.0.0.1:4173', [string]$Evidence = '../../docs/verification/completion-20260912')
$ErrorActionPreference = 'Stop'
$sessionName = 'completion-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Evidence))
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
$checks = [Collections.Generic.List[string]]::new()
function Browser([string[]]$Arguments) {
  $result = & npx --no-install agent-browser --session $sessionName @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
  return ($result -join "`n")
}
$helpers = @'
const key = 'linguatype:demo:v1:linguatype:workspace:v2';
const ws = () => JSON.parse(localStorage.getItem(key));
const current = () => ws().documents.find(d => d.documentId === ws().activeDocumentId);
const latest = () => { const versions=current().completedVersions || []; return versions[versions.length-1]; };
const calls = () => JSON.parse(sessionStorage.getItem('completion-test-calls') || '[]');
const seedCount = () => Number(sessionStorage.getItem('completion-test-seed-count') || '0');
const unseededDocumentIndex = () => ws().documents.findIndex(d => d.status === 'active' && !(ws().topicAssetPacks || []).some(p => p.sourceDocumentId === d.documentId));
const assert = (v, m) => { if (!v) throw new Error(m); };
const wait = async (f, m = 'UI timeout') => { for(let i=0;i<250;i++){if(f())return;await new Promise(r=>setTimeout(r,100));}throw new Error(m); };
const button = text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text);
const click = async text => { const b = button(text);assert(b && !b.disabled, 'Unavailable button: '+text);b.click();await new Promise(r=>setTimeout(r,80)); };
const fill = async (el, value) => { assert(el, 'Missing input'); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,80)); };
if (!window.__completionFetch) window.__completionFetch = window.fetch.bind(window);
if (!window.__completionSetItem) window.__completionSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(k,v) { if(this === localStorage && k === key && window.__failCompletionWrite)throw new DOMException('Synthetic quota failure','QuotaExceededError');return window.__completionSetItem.call(this,k,v); };
window.fetch = async (url, options) => {
 if(String(url) !== '/api/deposit')return window.__completionFetch(url, options);
 const body = JSON.parse(options.body), record = current().completedVersions.find(v=>v.snapshot===body.snapshot && v.status==='loading');
 assert(record && record.confirmedAt && record.requestId, 'API called before durable confirmation');
 const log = calls();log.push({versionId:record.id,snapshot:body.snapshot,mode:sessionStorage.getItem('completion-test-mode') || 'real'});sessionStorage.setItem('completion-test-calls',JSON.stringify(log));
 const mode = sessionStorage.getItem('completion-test-mode');
 if(mode === 'hold')return new Promise(()=>{});
 if(mode === 'fail')return new Response('{}',{status:503,headers:{'content-type':'application/json'}});
 if(mode === 'stub'){const paragraphs=body.snapshot.split('\n').filter(Boolean),reasonQuote=paragraphs[0],claimQuote=paragraphs[paragraphs.length-1];return new Response(JSON.stringify({version:1,documentId:body.documentId,candidate:{schemaVersion:2,topicTags:[],viewpoint:null,reasons:[],exampleIdea:null,sourceNodes:[{sourceNodeId:'s1',type:'claim',sourceQuote:claimQuote},{sourceNodeId:'s2',type:'reason',sourceQuote:reasonQuote}],argumentNodes:[{nodeId:'n1',type:'claim',normalizedZh:'公共投资应优先提供能减少私人交通依赖的可靠替代方案。',normalizedEn:null,usageScope:'适用于交通与公共服务投资的取舍。',conditions:[],sourceNodeIds:['s1']},{nodeId:'n2',type:'reason',normalizedZh:'可靠且便利的公共服务能减少人们对私人方案的依赖。',normalizedEn:null,usageScope:null,conditions:[],sourceNodeIds:['s2']}],relations:[{fromNodeId:'n2',toNodeId:'n1',type:'supports'}],rejectedNodes:[],languageExpressions:(body.existingExpressions && body.existingExpressions.some(value=>value==='reduce dependence on sth'))?[]:[{expression:'reduce dependence on sth',meaningZh:'减少对某事物的依赖',pattern:'reduce dependence on + [对象]',usageScope:null,sourceForm:'reduce dependence on private cars',sourceQuote:reasonQuote,attachedToNodeIds:['n2']}]},meta:{model:'synthetic-browser-check',promptVersion:'argument-asset-extraction-v5-single-reusable-thesis'}}),{status:200,headers:{'content-type':'application/json'}});}
 return window.__completionFetch(url,options);
};
'@
function Check([string]$Name, [string]$Body) {
  $script = '(async()=>{' + $helpers + "`n" + $Body + ";return 'PASS';})()"
  $result = $script | & npx --no-install agent-browser --session $sessionName eval --stdin 2>&1
  if ($LASTEXITCODE -ne 0 -or ($result -join '') -notmatch 'PASS') { throw ($Name + ': ' + ($result -join "`n")) }
  $checks.Add($Name)
  Write-Output "PASS $Name"
}
function Shot([string]$Name) { Browser -Arguments @('screenshot', (Join-Path $evidencePath $Name)) | Out-Null }
try {
  # The first launch must not capture a Windows daemon's inherited output pipe.
  & npx --no-install agent-browser --session $sessionName open "$BaseUrl/?demo=1"
  if ($LASTEXITCODE -ne 0) { throw 'Browser launch failed' }
  "localStorage.removeItem('linguatype:demo:v1:linguatype:workspace:v2');sessionStorage.clear();location.reload();'RESET'" | & npx --no-install agent-browser --session $sessionName eval --stdin | Out-Null
  Start-Sleep -Milliseconds 800
  Check 'Preview is explicit; cancel makes no record or API call' @'
await wait(()=>document.querySelector('.document-item'));
sessionStorage.setItem('completion-test-seed-count',String((ws().topicAssetPacks || []).length));
sessionStorage.setItem('completion-test-mode','stub');
const targetIndex=unseededDocumentIndex();assert(targetIndex>=0,'No unseeded demo document available');
document.querySelectorAll('.document-item')[targetIndex].click();await new Promise(r=>setTimeout(r,100));
const essay = 'Reliable bus services can reduce dependence on private cars by making daily journeys more convenient.\n\nGovernments should invest in public transport because affordable buses give residents an alternative to driving. For example, frequent services help commuters reach work without using their cars. Better connections also give people who cannot drive access to jobs and education.\n\nRoad maintenance remains necessary, but building more roads alone will not solve congestion. A balanced transport policy should protect essential roads while making public transport a practical choice.';
await fill(document.querySelector('#essay'),essay);
await wait(()=>current().essay===essay);
sessionStorage.setItem('completion-test-original',essay);
await click('定稿沉淀');
assert(!document.querySelector('input[type=checkbox]').checked,'Prechecked');
assert(button('确认这版，开始整理').disabled,'Unconfirmed enabled');
assert(document.querySelector('.completion-reason textarea').value==='','Reason prefilled');
assert(document.querySelector('.completion-preview').textContent===essay,'Full preview differs');
await click('返回继续修改');
assert(!(current().completedVersions || []).length && !calls().length,'Cancel wrote or requested');
await click('定稿沉淀');
'@
  Shot '01-confirm-desktop.png'
  Check 'Storage failure blocks confirmation and model; retry keeps reason' @'
await fill(document.querySelector('.completion-reason textarea'),'我想保留交通便利如何减少开车的理由。');
document.querySelector('input[type=checkbox]').click();
window.__failCompletionWrite=true;
await click('确认这版，开始整理');
await wait(()=>document.querySelector('[role=alert]'));
assert(!latest() && !calls().length,'Failed write was treated as completion');
assert(document.querySelector('.completion-reason textarea').value.includes('交通便利'),'Reason lost');
window.__failCompletionWrite=false;
await click('确认这版，开始整理');
await wait(()=>button('确认保存这些素材'), 'Real extraction did not return review');
await wait(()=>latest() && latest().status==='ready');
assert(document.querySelector('.argument-review-list'),'Argument review missing');
assert(calls().length===1,'Duplicate initial request');
assert(ws().topicAssetPacks.length===seedCount(),'Candidate leaked into library');
assert(latest().saveReason.includes('交通便利'),'Reason not persisted');
'@
  Shot '02-review-desktop.png'
Check 'Incomplete candidate edits and deletions are durably retained' @'
await fill(document.querySelectorAll('.attached-expression input')[1],'');
await click('稍后整理');
assert(!document.querySelector('dialog[open]'),'Review did not close after durable save');
sessionStorage.setItem('completion-test-edits',JSON.stringify(latest().candidate));
'@
  Browser -Arguments @('open', "$BaseUrl/?demo=1") | Out-Null
Check 'Refresh restores edited candidates without another model call' @'
await new Promise(r=>setTimeout(r,500));assert(button('定稿沉淀'),'Reload body: '+document.body.innerText.slice(0,500));
await click('定稿沉淀');
assert(button('确认保存这些素材'),'Did not resume review');
assert(JSON.stringify(latest().candidate)===sessionStorage.getItem('completion-test-edits'),'Edits lost');
assert(document.querySelectorAll('.attached-expression input')[1].value==='','Blank draft lost');
assert(calls().length===1,'Refresh requested model');
await fill(document.querySelectorAll('.attached-expression input')[1],'减少对某事物的依赖');
await wait(()=>latest().candidate && JSON.stringify(latest().candidate).includes('减少对某事物的依赖'));
await click('作为新思维资产保存');await wait(()=>latest().argumentDecision && latest().argumentDecision.action==='new');
window.__failCompletionWrite=true;
await click('确认保存这些素材');
await wait(()=>document.querySelector('[role=alert]'));
assert(latest().status==='ready' && ws().topicAssetPacks.length===seedCount(),'Failed save showed success');
window.__failCompletionWrite=false;
await click('确认保存这些素材');
await wait(()=>button('查看本次素材'));
assert(latest().status==='saved' && ws().topicAssetPacks.length===seedCount()+1,'Pack not durable');
assert(ws().topicAssetPacks[0].completion.versionId===latest().id,'Wrong receipt');
sessionStorage.setItem('completion-test-first-pack',JSON.stringify(ws().topicAssetPacks[0]));
'@
  Shot '03-result-desktop.png'
  Check 'Saved library leads with the reusable viewpoint' @'
await click('查看本次素材');assert(document.querySelector('.material-card[open]'),'Saved pack not expanded');
const primary=(ws().topicAssetPacks[0].argumentNodes || []).find(n=>n.type==='claim');assert(primary,'No reusable claim saved');
assert(document.querySelector('.argument-card summary strong').textContent===primary.normalizedZh,'Library primary title is not claim');
'@
  Shot '03-library-desktop.png'
  Check 'Deduplication and changed draft retain original source' @'
await click('打开来源作文');await click('定稿沉淀');
assert(button('打开来源作文'),'Same body not deduplicated');assert(calls().length===1,'Same body requested model');
await click('打开来源作文');
await fill(document.querySelector('#essay'), sessionStorage.getItem('completion-test-original')+'\n\nThis version also considers the needs of older residents.');
await wait(()=>current().essay.includes('older residents'));
assert(JSON.stringify(ws().topicAssetPacks[0])===sessionStorage.getItem('completion-test-first-pack'),'Editing draft mutated source');
sessionStorage.setItem('completion-test-mode','hold');
await click('定稿沉淀');assert(!document.querySelector('input[type=checkbox]').checked,'New body already confirmed');
document.querySelector('input[type=checkbox]').click();await click('确认这版，开始整理');
await wait(()=>latest() && latest().status==='loading');assert(calls().length===2,'New version request count');
'@
  Browser -Arguments @('open', "$BaseUrl/?demo=1") | Out-Null
  Check 'Interrupted request stays stopped; retry uses same confirmed version' @'
await wait(()=>button('定稿沉淀'));await click('定稿沉淀');
assert(button('重试整理这个完成版本'),'Interrupted state not recoverable');
assert(calls().length===2,'Reload silently retried');
const id=latest().id;sessionStorage.setItem('completion-test-mode','fail');
await click('重试整理这个完成版本');await wait(()=>latest() && latest().status==='error');
assert(calls().length===3 && calls().at(-1).versionId===id,'Retry changed version');
sessionStorage.setItem('completion-test-mode','stub');await click('重试整理这个完成版本');await wait(()=>button('确认保存这些素材'));
const claimDelete=[...document.querySelectorAll('.argument-claim button')].find(e=>e.textContent.trim()==='删除这个观点');assert(claimDelete,'Need claim delete');claimDelete.click();await new Promise(r=>setTimeout(r,100));
await click('结束本次整理');await wait(()=>button('返回文章'));
assert(latest().status==='empty' && ws().topicAssetPacks.length===seedCount()+1,'Empty candidate created pack');
'@
  Check 'New confirmed body creates revision while retaining earlier confirmation' @'
await click('返回文章');
await fill(document.querySelector('#essay'),sessionStorage.getItem('completion-test-original')+'\n\nA reliable network benefits residents of every age.');
await click('定稿沉淀');document.querySelector('input[type=checkbox]').click();await click('确认这版，开始整理');await wait(()=>button('确认保存这些素材'));await click('作为新思维资产保存');await click('确认保存这些素材');await wait(()=>button('查看本次素材'));
assert(ws().topicAssetPacks[0].revision===2,'Revision not advanced');
assert(ws().topicAssetPacks[0].previousRevisions[0].completion.versionId===JSON.parse(sessionStorage.getItem('completion-test-first-pack')).completion.versionId,'History receipt lost');
await click('返回文章');await fill(document.querySelector('#essay'),sessionStorage.getItem('completion-test-original'));
await click('定稿沉淀');await click('查看本次素材');
const historical=ws().topicAssetPacks[0].previousRevisions[0];assert(historical.sourceEssaySnapshot===sessionStorage.getItem('completion-test-original'),'Wrong historical source');
const oldOccurrence=JSON.parse(sessionStorage.getItem('completion-test-first-pack')).argumentNodes.find(n=>n.type==='claim').nodeId;
assert(ws().argumentAssets.some(a=>a.occurrenceIds.includes(oldOccurrence)),'Historical occurrence lost from long-term asset');
await click('打开来源作文');
'@
  Browser -Arguments @('set','viewport','390','844') | Out-Null
  Check 'Narrow screen supports full preview and return' @'
await fill(document.querySelector('#essay'),sessionStorage.getItem('completion-test-original')+'\n\nAffordable fares matter too.');
await click('定稿沉淀');
assert(document.documentElement.scrollWidth<=window.innerWidth,'Horizontal overflow');
assert(document.querySelector('.completion-preview').scrollWidth<=document.querySelector('.completion-preview').clientWidth+1,'Preview overflow');
'@
  Shot '04-confirm-mobile.png'
  Check 'Narrow screen completes review and both confirmations' @'
document.querySelector('input[type=checkbox]').click();
button('确认这版，开始整理').scrollIntoView({block:'center'});
await click('确认这版，开始整理');await wait(()=>button('确认保存这些素材'));
assert(document.documentElement.scrollWidth<=window.innerWidth,'Review overflow');
assert(document.querySelector('.material-source blockquote').textContent===latest().candidate.sourceNodes[0].sourceQuote,'Source not shown');
await click('作为新思维资产保存');
button('确认保存这些素材').scrollIntoView({block:'center'});
assert(button('确认保存这些素材').getBoundingClientRect().bottom<=window.innerHeight,'Save button unreachable');
await click('确认保存这些素材');await wait(()=>button('查看本次素材'));
assert(ws().topicAssetPacks[0].revision===3 && latest().status==='saved','Mobile save failed');
'@
  Shot '05-result-mobile.png'
  Check 'Mobile return to draft preserves confirmed materials' @'
await click('返回文章');
const pack=JSON.stringify(ws().topicAssetPacks[0]);
await fill(document.querySelector('#essay'),current().essay+'\n\nMore bus stops would improve access.');
await click('定稿沉淀');
assert(!document.querySelector('input[type=checkbox]').checked,'Changed article still confirmed');
assert(JSON.stringify(ws().topicAssetPacks[0])===pack,'Returned writing changed materials');
'@
  Check 'Conflicting external write is not overwritten or sent for extraction' @'
const before=calls().length;
const external=ws();external.documents[0].essay+=' A newer edit from another window.';
localStorage.setItem(key,JSON.stringify(external));sessionStorage.setItem('completion-test-external',JSON.stringify(external));
document.querySelector('input[type=checkbox]').click();await click('确认这版，开始整理');await wait(()=>document.querySelector('[role=alert]'));
assert(calls().length===before,'Conflict sent model request');
assert(localStorage.getItem(key)===sessionStorage.getItem('completion-test-external'),'Conflict overwrote newer workspace');
await click('返回继续修改');await click('定稿沉淀');await click('继续整理已确认版本');await click('返回文章');
assert(!document.querySelector('dialog[open]'),'Conflict traps user in modal');
'@
  @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); checks = $checks.ToArray(); mode = 'Isolated demo browser; deterministic extraction plus synthetic failure/interruption/revision probes'; personalWorkspaceTouched = $false } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidencePath 'browser-results.json') -Encoding utf8
  Write-Output "Passed $($checks.Count) browser scenarios. Evidence: $evidencePath"
} finally { Browser -Arguments @('close') | Out-Null }
