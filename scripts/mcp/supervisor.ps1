# WealthOS Universal MCP — Windows PowerShell Supervisor Script
# Enforces localhost binding and launches supervisor daemon

$HostAddress = "127.0.0.1"
$Port = 8787

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "WEALTHOS UNIVERSAL MCP — WINDOWS LOCAL SUPERVISOR" -ForegroundColor Cyan
Write-Host "Binding: http://$HostAddress`:$Port (STRICTLY LOCALHOST, NO CLOUD)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

if (-not $env:WEALTHOS_PRODUCT_KEY) {
    Write-Warning "WEALTHOS_PRODUCT_KEY is not set. Product plane will fail closed."
}
if (-not $env:WEALTHOS_DEV_KEY) {
    Write-Warning "WEALTHOS_DEV_KEY is not set. Dev/Review plane will fail closed."
}

npx tsx scripts/mcp/supervisor.ts
