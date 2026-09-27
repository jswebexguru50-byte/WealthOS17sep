param(
    [string]$TaskName = 'WealthOS Kite Market Data Daemon'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
$python = if ($pythonCommand) {
    $pythonCommand.Source
} else {
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (-not (Test-Path $candidate)) { throw 'Python 3.12 runtime was not found.' }
    $candidate
}
$script = Join-Path $repoRoot 'scripts\market_data\kite_market_data_daemon.py'
$arguments = ('"{0}" --mode all' -f $script)

# 14:20 Dubai time is 15:50 IST, after the NSE/BSE regular session. The job
# fetches the whole session's 15-minute bars and the daily adjusted increment.
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 2:20PM
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments -WorkingDirectory $repoRoot
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Deterministic, no-LLM Kite instrument master, 15-minute OHLCV, and daily adjusted OHLCV refresh.' -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, TaskPath
