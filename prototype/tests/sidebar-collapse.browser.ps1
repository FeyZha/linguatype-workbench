param([string]$BaseUrl = 'http://127.0.0.1:4173', [string]$Evidence = '../../docs/verification/sidebar-collapse-browser-20260915')
$ErrorActionPreference = 'Stop'
$sessionName = 'sidebar-collapse-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Evidence))
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
function Browser([string[]]$Arguments) {
  & npx.cmd --no-install agent-browser --session $sessionName @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Browser command failed: $($Arguments -join ' ')" }
}
function Evaluate([string]$Code) {
  $Code | & npx.cmd --no-install agent-browser --session $sessionName eval --stdin
  if ($LASTEXITCODE -ne 0) { throw 'Browser assertion failed' }
}
try {
  Browser @('open', "$BaseUrl/?demo=learner")
  Start-Sleep -Milliseconds 600
  Evaluate "document.querySelector('.desktop-sidebar-toggle').click();'COLLAPSED'"
  Start-Sleep -Milliseconds 350
  Evaluate @'
(()=>{
  const shell=document.querySelector('.app-shell'), pane=document.querySelector('.library-pane'), button=document.querySelector('.desktop-sidebar-toggle');
  const visible=[...pane.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'});
  const paneStyle=getComputedStyle(pane), rect=button.getBoundingClientRect();
  if(shell.dataset.sidebarCollapsed!=='true') throw new Error('not collapsed');
  if(visible.length!==1||visible[0]!==button) throw new Error('more than one collapsed control');
  if(!button.querySelector('.sidebar-toggle-mark')||getComputedStyle(button.querySelector('svg')).display!=='none') throw new Error('collapsed button is not brand-only');
  if(Math.round(rect.left)!==0||Math.round(rect.width)!==50||Math.round(rect.height)!==50) throw new Error('wrong attached square');
  if(getComputedStyle(button).borderTopLeftRadius!=='0px'||getComputedStyle(button).borderBottomLeftRadius!=='0px') throw new Error('left edge is not attached');
  if(paneStyle.backgroundColor!=='rgba(0, 0, 0, 0)'||paneStyle.borderRightWidth!=='0px') throw new Error('blank rail remains');
  if(document.elementFromPoint(2,500)?.closest('.library-pane')) throw new Error('left blank strip remains');
  return 'PASS';
})()
'@
  Browser @('screenshot', (Join-Path $evidencePath '01-collapsed-tag.png'))
  Evaluate "document.querySelector('.desktop-sidebar-toggle').click();'EXPANDED'"
  Start-Sleep -Milliseconds 250
  Evaluate "(()=>{if(document.querySelector('.app-shell').dataset.sidebarCollapsed!=='false')throw new Error('not expanded');if(getComputedStyle(document.querySelector('.sidebar-wordmark')).display==='none')throw new Error('wordmark hidden');return 'PASS'})()"
  @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); checks = @('collapsed rail width is zero', 'one 50x50 brand-only button remains', 'button left edge is attached to viewport boundary', 'left edge belongs to writing area', 'same button expands library') } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidencePath 'browser-results.json') -Encoding utf8
  Write-Output "Passed collapsed sidebar browser verification. Evidence: $evidencePath"
} finally { Browser @('close') }
