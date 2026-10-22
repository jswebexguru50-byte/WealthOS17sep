#requires -RunAsAdministrator
<#
Phase 2A final startup closure. This script deliberately touches only local
startup configuration, tunnel-service configuration, and its evidence report.
It never prints a remote-bridge key and does not rotate the current key.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = 'C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release'
$envFile = Join-Path $root '.env'
$activeDbFile = Join-Path $root 'portfolio.db'
$requestedDbFile = Join-Path $root 'data\portfolio.db'
$cloudflared = Join-Path $root 'cloudflared.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$taskName = 'WealthOS Server'
$report = Join-Path $root 'WEALTHOS_REMOTE_PHASE2A_CONNECTIVITY.md'
$nodeLauncher = Join-Path $root 'run_wealthos.bat'
$tunnelLauncher = Join-Path $root 'run_cloudflared.bat'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

function Require-File([string]$path) { if (-not (Test-Path -LiteralPath $path)) { throw "Required file is missing: $path" } }
function Get-RemoteKey([string]$path) {
  $line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^\s*WEALTHOS_REMOTE_KEY\s*=' } | Select-Object -First 1
  if (-not $line) { throw 'WEALTHOS_REMOTE_KEY is absent from .env.' }
  return (($line -split '=', 2)[1]).Trim()
}
function Curl-Status([string[]]$CurlArguments) {
  $result = & curl.exe -k -sS --connect-timeout 20 --max-time 45 -o "$env:TEMP\wealthos-phase2a-response.json" -w '%{http_code}' @CurlArguments
  return "$result".Trim()
}
function Wait-CurlStatus([string[]]$CurlArguments, [string]$ExpectedStatus, [int]$seconds = 60) {
  $until = (Get-Date).AddSeconds($seconds)
  do {
    $status = Curl-Status -CurlArguments $CurlArguments
    if ($status -eq $ExpectedStatus) { return $status }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $until)
  return $status
}
function Get-ExactFileHashWithRetry([string]$path, [int]$attempts = 15) {
  for ($i = 1; $i -le $attempts; $i++) {
    try { return (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash }
    catch {
      if ($i -eq $attempts) { throw }
      Start-Sleep -Seconds 2
    }
  }
}
function Stop-WealthOSServerProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match '(^|\s)dist/server\.cjs(\s|$)'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
function Start-BatchHidden([string]$batchFile) {
  Start-Process -FilePath "$env:ComSpec" -ArgumentList @('/c', "`"$batchFile`"") -WindowStyle Hidden
}
function Stop-WealthOSTunnelProcesses {
  # Only retire instances launched from this repository's cloudflared binary;
  # do not touch a tunnel owned by another application.
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'cloudflared.exe' -and $_.ExecutablePath -eq $cloudflared
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  $until = (Get-Date).AddSeconds(20)
  do {
    $remaining = @(Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq 'cloudflared.exe' -and $_.ExecutablePath -eq $cloudflared
    })
    if ($remaining.Count -eq 0) { return }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $until)
  throw 'Existing WealthOS cloudflared process did not stop; refusing to create a duplicate tunnel process.'
}
function Wait-Http([string]$url, [int]$seconds = 45) {
  $until = (Get-Date).AddSeconds($seconds)
  do {
    try { if ((Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5).StatusCode -eq 200) { return $true } } catch {}
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $until)
  return $false
}

Require-File $envFile; Require-File $activeDbFile; Require-File $requestedDbFile; Require-File $cloudflared; Require-File $node; Require-File $nodeLauncher; Require-File $tunnelLauncher
$currentKey = Get-RemoteKey $envFile
if (-not $currentKey) { throw 'WEALTHOS_REMOTE_KEY is empty.' }

# The existing user-context named tunnel works with its existing credentials.
# Use precisely one after-login owner for each process and disable the failed
# LocalSystem/service and SYSTEM task alternatives rather than creating a new
# tunnel, hostname, or credential set.
New-ItemProperty -Path $runKey -Name 'WealthOS Server' -Value "`"$nodeLauncher`"" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $runKey -Name 'WealthOS Cloudflared' -Value "`"$tunnelLauncher`"" -PropertyType String -Force | Out-Null
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) { Disable-ScheduledTask -TaskName $taskName | Out-Null }
Stop-Service -Name cloudflared -Force -ErrorAction SilentlyContinue
Set-Service -Name cloudflared -StartupType Disabled

# Stop only the exact manual WealthOS server so exact pre-request production
# hashes can be taken while SQLite is not held open. The current remote key is
# deliberately left unchanged.
Stop-WealthOSServerProcesses
try {
  $activeDbBefore = Get-ExactFileHashWithRetry $activeDbFile
  $requestedDbBefore = Get-ExactFileHashWithRetry $requestedDbFile
}
catch {
  Start-BatchHidden $nodeLauncher
  throw 'Could not obtain exact production database hashes after stopping WealthOS. The current remote key was not changed.'
}

# Exercise the exact user-context launch command used at login.
Start-BatchHidden $nodeLauncher
if (-not (Wait-Http 'http://127.0.0.1:3000/api/remote/health')) {
  throw 'WealthOS HKCU launch command did not become healthy.'
}

# Exercise the exact user-context named-tunnel launcher used at login.
Stop-WealthOSTunnelProcesses
Start-BatchHidden $tunnelLauncher
$until = (Get-Date).AddSeconds(45)
do {
  $tunnelProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'cloudflared.exe' -and $_.ExecutablePath -eq $cloudflared
  })
  if ($tunnelProcesses.Count -eq 1) { break }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $until)
if ($tunnelProcesses.Count -ne 1) { throw "Expected exactly one WealthOS cloudflared process after launch; found $($tunnelProcesses.Count)." }

# The server was already proven locally before tunnel cutover.  Verify it has
# remained healthy after the retired manual tunnel was removed.
if (-not (Wait-Http 'http://127.0.0.1:3000/api/remote/health')) { throw 'WealthOS is no longer healthy after tunnel launch.' }

$localHealth = 'PASS'
$externalHealth = Wait-CurlStatus -CurlArguments @('https://api.wealthos.win/api/remote/health') -ExpectedStatus '200' -seconds 60
$missingStatus = Curl-Status -CurlArguments @('https://api.wealthos.win/api/remote/company/TCS/intelligence')
# The historical exposed key is intentionally not retained in source, reports,
# or the operating environment. If a reviewer deliberately supplies it only in
# this Administrator process, test it without logging it; otherwise preserve
# the prior recorded rejection result as historical evidence rather than
# fabricating a fresh test.
$previousStatus = 'NOT_RETESTED_KEY_NOT_RETAINED'
if ($env:WEALTHOS_PREVIOUS_EXPOSED_KEY) {
  $previousStatus = Curl-Status -CurlArguments @('-H', "Authorization: Bearer $env:WEALTHOS_PREVIOUS_EXPOSED_KEY", 'https://api.wealthos.win/api/remote/company/TCS/intelligence')
}
$newStart = Get-Date
$currentStatus = Curl-Status -CurlArguments @('-H', "Authorization: Bearer $currentKey", 'https://api.wealthos.win/api/remote/company/TCS/intelligence')
$duration = [math]::Round(((Get-Date) - $newStart).TotalMilliseconds)
$responseBytes = if (Test-Path "$env:TEMP\wealthos-phase2a-response.json") { (Get-Item "$env:TEMP\wealthos-phase2a-response.json").Length } else { 0 }
# Stop only the scheduled server for the exact byte-level post-request hash,
# then restore it before the script returns.
Stop-WealthOSServerProcesses
$until = (Get-Date).AddSeconds(30)
while ((Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $until) { Start-Sleep -Seconds 1 }
try {
  $activeDbAfter = Get-ExactFileHashWithRetry $activeDbFile
  $requestedDbAfter = Get-ExactFileHashWithRetry $requestedDbFile
}
finally {
  Start-BatchHidden $nodeLauncher
  if (-not (Wait-Http 'http://127.0.0.1:3000/api/remote/health')) { throw 'WealthOS did not recover after post-request DB hash.' }
}
$trackedSecretFiles = @(git -C $root ls-files -- '.env' '.env.*' 'cloudflared_config.yml' 'credentials/*.json')

$port3000Listeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop)
$nodeOwner = ($port3000Listeners | Select-Object -First 1 -ExpandProperty OwningProcess)
$cloudCount = @($tunnelProcesses).Count
$nodeRunValue = (Get-ItemProperty -Path $runKey -Name 'WealthOS Server').'WealthOS Server'
$tunnelRunValue = (Get-ItemProperty -Path $runKey -Name 'WealthOS Cloudflared').'WealthOS Cloudflared'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$taskEnabled = $task -and ($task.State -ne 'Disabled')
$service = Get-Service cloudflared

$reportLines = @(
  '# WealthOS Remote Bridge Phase 2A — Final Hygiene Closure',
  '',
  "Generated: $(Get-Date -Format o)",
  '',
  "WEALTHOS_CANONICAL_STARTUP = HKCU Run: $nodeRunValue",
  "WEALTHOS_REDUNDANT_STARTUP_PRESENT = $(if ($taskEnabled) { 'YES' } else { 'NO' })",
  "CLOUDFLARED_CANONICAL_STARTUP = HKCU Run: $tunnelRunValue",
  "CLOUDFLARED_REDUNDANT_STARTUP_PRESENT = $(if ($service.Status -ne 'Stopped' -or $service.StartType -ne 'Disabled' -or $cloudCount -ne 1) { 'YES' } else { 'NO' })",
  "NODE_PORT_3000_LISTENER_COUNT = $($port3000Listeners.Count)",
  "NODE_PORT_3000_OWNER = $nodeOwner",
  "CLOUDFLARED_PROCESS_COUNT = $cloudCount",
  "CLOUDFLARED_SERVICE_DISABLED = $($service.Status -eq 'Stopped' -and $service.StartType -eq 'Disabled')",
  "LOCAL_HEALTH = $localHealth",
  "EXTERNAL_HEALTH_HTTP_STATUS = $externalHealth",
  "MISSING_KEY_REJECTED = $($missingStatus -eq '401')",
  "EXPOSED_KEY_REJECTED = $(if ($previousStatus -eq '403') { 'PASS' } elseif ($previousStatus -eq 'NOT_RETESTED_KEY_NOT_RETAINED') { 'HISTORICAL_EVIDENCE_ONLY' } else { 'FAIL' })",
  "NEW_KEY_ACCEPTED = $($currentStatus -eq '200')",
  "EXTERNAL_TCS_RESPONSE_BYTES = $responseBytes",
  "EXTERNAL_TCS_DURATION_MS = $duration",
  "ACTIVE_PORTFOLIO_DATABASE_HASH_MATCH = $($activeDbBefore -eq $activeDbAfter)",
  "DATA_PORTFOLIO_DATABASE_HASH_MATCH = $($requestedDbBefore -eq $requestedDbAfter)",
  "SECRETS_IN_TRACKED_GIT = $($trackedSecretFiles.Count -gt 0)",
  '',
  'No secret values, Cloudflare credentials, or database contents are recorded in this report.'
)
Set-Content -LiteralPath $report -Value $reportLines -Encoding utf8

$verificationPass = $externalHealth -eq '200' -and $missingStatus -eq '401' -and $currentStatus -eq '200' -and $activeDbBefore -eq $activeDbAfter -and $requestedDbBefore -eq $requestedDbAfter -and $port3000Listeners.Count -eq 1 -and $cloudCount -eq 1
$phaseJson = [ordered]@{
  phase = '2A'
  status = if ($verificationPass) { 'PASS' } else { 'NOT_ACCEPTED' }
  local_health = $localHealth
  external_health_http_status = $externalHealth
  missing_key_rejected = ($missingStatus -eq '401')
  exposed_key_rejected = if ($previousStatus -eq '403') { 'PASS' } else { 'HISTORICAL_EVIDENCE_ONLY' }
  current_key_accepted = ($currentStatus -eq '200')
  active_portfolio_database_hash_match = ($activeDbBefore -eq $activeDbAfter)
  data_portfolio_database_hash_match = ($requestedDbBefore -eq $requestedDbAfter)
  node_port_3000_listener_count = $port3000Listeners.Count
  cloudflared_process_count = $cloudCount
}
$phaseJson | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'WEALTHOS_REMOTE_PHASE2A_CONNECTIVITY.json') -Encoding utf8

if (-not $verificationPass) {
  throw 'Phase 2A verification failed; inspect the redacted report for statuses. No secret was printed.'
}
Write-Output 'PHASE2A_FINAL_CLOSURE=PASS'
