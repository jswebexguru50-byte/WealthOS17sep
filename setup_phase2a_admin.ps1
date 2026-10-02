$ErrorActionPreference = "Stop"
cd "C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release"

Write-Host "Installing cloudflared as a Windows service..."
.\cloudflared.exe service install

Write-Host "Creating WealthOS Server scheduled task..."
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "dist/server.cjs" -WorkingDirectory "C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "WealthOS Server" -Action $action -Trigger $trigger -Principal $principal -Force

Write-Host "Done! Please reboot Windows."
