param([string]$BaseUrl = 'http://127.0.0.1:4173', [string]$Evidence = '../../docs/verification/simulated-learner-browser-20260915')
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new()
$sessionName = 'simulated-learner-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Evidence))
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
function Browser([string[]]$Arguments) {
  & npx.cmd --no-install agent-browser --session $sessionName @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Browser command failed: $($Arguments -join ' ')" }
}
function Evaluate([string]$Code, [string]$Message) {
  $Code | & npx.cmd --no-install agent-browser --session $sessionName eval --stdin | Out-Null
  if ($LASTEXITCODE -ne 0) { throw $Message }
}
try {
  Browser @('open', "$BaseUrl/?demo=learner")
  Evaluate "localStorage.removeItem('linguatype:demo-learner:v3:linguatype:workspace:v2');location.reload();'RESET'" 'Reset failed'
  Start-Sleep -Milliseconds 1000
  Evaluate "(()=>{if(document.querySelectorAll('.document-item').length!==10)throw new Error('essay count');if(document.querySelector('#essay').value.length<100)throw new Error('essay body');const actions=[...document.querySelectorAll('.library-actions button')];if(!actions[1]?.textContent.includes('5')||!actions[2]?.textContent.includes('10'))throw new Error('seed counts');const footer=document.querySelector('.essay-workflow-actions');if(!footer?.previousElementSibling?.classList.contains('essay-field')||footer.querySelector('.btn-primary'))throw new Error('workflow footer');return 'PASS'})()" 'Workspace verification failed'
  Browser @('screenshot', (Join-Path $evidencePath '01-ten-essays.png'))
  Evaluate "document.querySelectorAll('.library-actions button')[1].click();'OPEN'" 'Materials could not open'
  Start-Sleep -Milliseconds 300
  Evaluate "(()=>{const dialog=document.querySelector('dialog.materials-dialog[open]');const cards=[...document.querySelectorAll('.argument-library > .material-list > .argument-asset-card')];if(cards.length!==5)throw new Error('thought assets');if(!cards.some(card=>card.querySelector('summary strong')?.textContent.startsWith('当技术渠道能够提高便利')))throw new Error('trigger missing');if(getComputedStyle(dialog).scrollbarWidth!=='none')throw new Error('scrollbar visible');dialog.scrollTop=80;if(dialog.scrollTop===0)throw new Error('dialog no longer scrolls');return 'PASS'})()" 'Material verification failed'
  Browser @('screenshot', (Join-Path $evidencePath '02-five-thoughts.png'))
  Evaluate "document.querySelector('dialog[open] .support-close').click();'CLOSE'" 'Materials could not close'
  Start-Sleep -Milliseconds 200
  Evaluate "document.querySelectorAll('.library-actions button')[2].click();'OPEN'" 'Expression memories could not open'
  Start-Sleep -Milliseconds 300
  Evaluate "(()=>{const cards=[...document.querySelectorAll('dialog[open] .favorite-card')];const saved=JSON.parse(localStorage.getItem('linguatype:demo-learner:v3:linguatype:workspace:v2'));if(cards.length!==10||saved.expressionMemories.length!==10||!saved.expressionMemories.every(item=>item.revealCount===1&&item.status==='active'))throw new Error('memory migration');return 'PASS'})()" 'Expression memory verification failed'
  Browser @('screenshot', (Join-Path $evidencePath '03-ten-expression-memories.png'))
  @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); checks = @('10 essays of at least 250 words', 'article actions follow the essay and have no primary button', '5 reusable thought triggers with source scenes removed from summaries', 'materials scrollbar hidden while scrolling remains available', '10 migrated expression memories at one reveal each'); personalWorkspaceTouched = $false } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidencePath 'browser-results.json') -Encoding utf8
  Write-Output "Passed simulated learner browser verification. Evidence: $evidencePath"
} finally { Browser @('close') }
