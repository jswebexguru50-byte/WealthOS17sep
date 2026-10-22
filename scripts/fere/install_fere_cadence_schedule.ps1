param([string]$TaskName = 'TejHQ FERE Incremental Cadence', [int]$IntervalDays = 15)
$ErrorActionPreference = 'Stop'
if ($IntervalDays -lt 1) { throw 'IntervalDays must be at least one.' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runner = Join-Path $PSScriptRoot 'run_fere_cadence.py'
$python = 'C:\Users\gopal\AppData\Local\Programs\Python\Python312\pythonw.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "Python not found: $python" }
if (-not (Test-Path -LiteralPath $runner)) { throw "Cadence runner not found: $runner" }
# Runs nightly after NSE close. The coordinator performs lightweight new-company
# discovery daily and starts the full official refresh only when 15 days are due.
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $runner + '" --interval-days ' + $IntervalDays) -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00PM
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, TaskPath
