<#
.SYNOPSIS
    Installs a daily scheduled task to run the ITAS Master Dossier Pipeline at 10:00 AM IST.

.DESCRIPTION
    Creates or updates a Windows Scheduled Task named 'NRI_WealthOS_Daily_Dossier_10AM'
    that runs every day at 10:00 AM, executing:
    npx tsx scripts/run_daily_dossier_pipeline.ts --publish --on-schedule
#>

$taskName = "NRI_WealthOS_Daily_Dossier_10AM"
$workingDir = "c:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release"
$cmd = "cmd.exe"
$arguments = "/c cd /d `"$workingDir`" && npx tsx scripts/run_daily_dossier_pipeline.ts --publish --on-schedule >> scratch\daily_pipeline_scheduled.log 2>&1"

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📅 Registering Daily Dossier Scheduled Task (10:00 AM IST)..." -ForegroundColor Cyan
Write-Host "   Task Name: $taskName"
Write-Host "   Working Directory: $workingDir"
Write-Host "   Command: $arguments"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    # Check if task already exists
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "ℹ️  Found existing task '$taskName'. Updating..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    $action = New-ScheduledTaskAction -Execute $cmd -Argument $arguments -WorkingDirectory $workingDir
    $trigger = New-ScheduledTaskTrigger -Daily -At "10:00AM"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily automated execution of ITAS 49-Stock Master Dossier and email delivery to parinay08@gmail.com at 10:00 AM IST" | Out-Null

    Write-Host "✅ Scheduled Task '$taskName' registered successfully!" -ForegroundColor Green
    Write-Host "   Trigger: Daily at 10:00 AM" -ForegroundColor Green
    Write-Host "   Target: parinay08@gmail.com" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Could not register Windows Scheduled Task directly: $_" -ForegroundColor Yellow
    Write-Host "   Fallback: Run via CLI on-demand anytime using: npm run dossier:on-demand" -ForegroundColor White
}
