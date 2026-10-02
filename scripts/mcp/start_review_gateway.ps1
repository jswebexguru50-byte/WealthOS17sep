# ----------------------------------------------------------------------
# WealthOS Universal MCP - Secure Remote Review Gateway
# Exposes local MCP server (127.0.0.1:8787) to a public HTTPS URL
# for independent ChatGPT / external LLM review access.
# ----------------------------------------------------------------------

param(
    [string]$ReviewKey = "",
    [int]$McpPort = 8787,
    [string]$CloudflareBin = ".tools\cloudflared.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------------------------------------------------
# 1. Load .env
# ----------------------------------------------------------------------
$envFile = Join-Path $PSScriptRoot "..\..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $k = $Matches[1].Trim()
            $v = $Matches[2].Trim().Trim('"').Trim("'")
            if (-not [Environment]::GetEnvironmentVariable($k)) {
                [Environment]::SetEnvironmentVariable($k, $v)
            }
        }
    }
}

if (-not $ReviewKey) {
    $ReviewKey = [Environment]::GetEnvironmentVariable("WEALTHOS_REVIEW_KEY")
}
if (-not $ReviewKey) {
    $ReviewKey = [Environment]::GetEnvironmentVariable("WEALTHOS_DEV_KEY")
}
if (-not $ReviewKey) {
    Write-Error "GATEWAY_START_FAILED: No review key found in environment or .env. Set WEALTHOS_REVIEW_KEY."
    exit 1
}

# ----------------------------------------------------------------------
# 2. Verify local MCP server is running on 127.0.0.1:$McpPort
# ----------------------------------------------------------------------
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "WEALTHOS UNIVERSAL MCP - SECURE REMOTE REVIEW GATEWAY" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[ 1 ] Checking local MCP server health on 127.0.0.1:$McpPort ..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$McpPort/health" -TimeoutSec 5
    Write-Host "      [PASS] MCP server is live. Tools registered: $($health.registeredToolsCount)" -ForegroundColor Green
    Write-Host "      [PASS] Transport: $($health.transport)" -ForegroundColor Green
} catch {
    Write-Error "GATEWAY_START_FAILED: Local MCP server is not running on 127.0.0.1:$McpPort. Start it first with: npx tsx src/mcp/transports/http.ts"
    exit 1
}

# ----------------------------------------------------------------------
# 3. Locate cloudflared binary
# ----------------------------------------------------------------------
Write-Host ""
Write-Host "[ 2 ] Verifying cloudflared tunnel binary ..." -ForegroundColor Yellow
$cfBin = Join-Path $PSScriptRoot "..\..\$CloudflareBin"
if (-not (Test-Path $cfBin)) {
    Write-Host "      cloudflared not found at $cfBin, downloading ..." -ForegroundColor Yellow
    $cfDir = Split-Path $cfBin -Parent
    if (-not (Test-Path $cfDir)) {
        New-Item -ItemType Directory -Path $cfDir | Out-Null
    }
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfBin -UseBasicParsing
    Write-Host "      [PASS] Downloaded cloudflared." -ForegroundColor Green
} else {
    Write-Host "      [PASS] cloudflared binary found." -ForegroundColor Green
}

# ----------------------------------------------------------------------
# 4. Start Cloudflare Quick Tunnel
# ----------------------------------------------------------------------
Write-Host ""
Write-Host "[ 3 ] Starting Cloudflare Quick Tunnel to 127.0.0.1:$McpPort ..." -ForegroundColor Yellow
Write-Host "      (Ephemeral URL changes on each restart. Kill script to close.)" -ForegroundColor Gray
Write-Host ""

$tunnelUrl = $null
$logFile = Join-Path $env:TEMP "wealthos_cf_tunnel.log"
if (Test-Path $logFile) {
    Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue
}

$cfProc = Start-Process -FilePath $cfBin `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:$McpPort", "--no-autoupdate" `
    -RedirectStandardError $logFile `
    -NoNewWindow -PassThru

# Poll log for URL (cloudflared outputs tunnel URL to stderr)
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($logContent) {
            $allMatches = [regex]::Matches($logContent, "https://([a-zA-Z0-9\-]+)\.trycloudflare\.com")
            foreach ($m in $allMatches) {
                if ($m.Groups[1].Value -ne "api") {
                    $tunnelUrl = $m.Value
                    break
                }
            }
        }
    }
}

if (-not $tunnelUrl) {
    if (-not $cfProc.HasExited) { $cfProc.Kill() }
    Write-Error "GATEWAY_START_FAILED: Could not detect trycloudflare.com URL within 25 seconds. Log: $logFile"
    exit 1
}

# ----------------------------------------------------------------------
# 5. Output connection details
# ----------------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  TUNNEL ACTIVE - REMOTE REVIEW GATEWAY READY" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Remote MCP URL (Review Plane):" -ForegroundColor Cyan
Write-Host "    $tunnelUrl/mcp/review" -ForegroundColor White
Write-Host ""
Write-Host "  Remote MCP URL (Product Plane):" -ForegroundColor Cyan
Write-Host "    $tunnelUrl/mcp" -ForegroundColor White
Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  CHATGPT MCP CONNECTOR CONFIGURATION" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Name:         WealthOS Review MCP" -ForegroundColor White
Write-Host "  Server URL:   $tunnelUrl/mcp/review" -ForegroundColor Cyan
Write-Host "  Auth Type:    Bearer" -ForegroundColor White
Write-Host "  Bearer Token: [Use WEALTHOS_REVIEW_KEY from .env]" -ForegroundColor Yellow
Write-Host ""
Write-Host "  SECURITY NOTICE:" -ForegroundColor Red
Write-Host "  - Never commit the tunnel URL or API keys to Git." -ForegroundColor Red
Write-Host "  - The tunnel is ephemeral and closes immediately when stopped." -ForegroundColor Red
Write-Host "  - Press Ctrl+C in this console to terminate remote access." -ForegroundColor Red
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Tunnel PID: $($cfProc.Id)" -ForegroundColor Gray
Write-Host "  Tunnel Log: $logFile" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Gateway running. Press Ctrl+C to close." -ForegroundColor Yellow

try {
    $cfProc.WaitForExit()
} catch {
    # Caught interrupt / cancellation
} finally {
    if (-not $cfProc.HasExited) {
        $cfProc.Kill()
    }
    Write-Host ""
    Write-Host "Gateway closed. Remote access terminated." -ForegroundColor Red
}
