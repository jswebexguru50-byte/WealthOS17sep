param(
    [string]$TaskName = 'WealthOS Fundamental Enrichment Resume'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$command = 'cd /d "{0}" && set "NODE_OPTIONS=--require=./scripts/node_userinfo_fallback.cjs --use-system-ca" && npx.cmd tsx scripts/fundamental/run_upstox_fundamental_enrichment.ts --group ordered --batch-size 1 --endpoint-delay-ms 750 --symbol-delay-ms 1500 >> data\fundamental_enrichment\upstox_fundamentals_resume.log 2>&1' -f $repoRoot
$action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument ('/d /c "{0}"' -f $command)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Resumes deterministic Upstox fundamentals enrichment. Existing terminal endpoint snapshots are skipped.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, TaskPath
