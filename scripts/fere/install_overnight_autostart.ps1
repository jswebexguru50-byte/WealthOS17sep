param(
    [string]$TaskName = 'TejHQ FERE Resumable Collector'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$watchdog = Join-Path $PSScriptRoot 'run_overnight_watchdog.py'
$python = 'C:\Users\gopal\AppData\Local\Programs\Python\Python312\pythonw.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "Python not found: $python" }
if (-not (Test-Path -LiteralPath $watchdog)) { throw "Watchdog not found: $watchdog" }

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $watchdog + '"') -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, TaskPath
