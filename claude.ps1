# claude.ps1 — Launch Claude CLI
# Usage:
#   .\claude.ps1                  → AWS Bedrock (primary)
#   .\claude.ps1 -OpenRouter      → OpenRouter free models (when Bedrock quota hit)
#   .\claude.ps1 -OmniRoute       → OmniRoute local gateway

param(
    [switch]$OpenRouter,  # Use OpenRouter free tier (needs OPENROUTER_API_KEY in .env)
    [switch]$OmniRoute    # Use OmniRoute local gateway
)

$EnvFile = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: .env not found at $EnvFile" -ForegroundColor Red
    exit 1
}

# Load .env into current process environment
Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#].+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $key   = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

if ($OpenRouter) {
    # ── OpenRouter mode: free tier (50 req/day free, Claude Haiku or best free model) ──
    $orKey = $env:OPENROUTER_API_KEY
    if (-not $orKey) {
        Write-Host "ERROR: OPENROUTER_API_KEY not found in .env" -ForegroundColor Red
        Write-Host "1. Sign up free at https://openrouter.ai" -ForegroundColor Yellow
        Write-Host "2. Go to Dashboard -> API Keys -> Create key" -ForegroundColor Yellow
        Write-Host "3. Add to .env:  OPENROUTER_API_KEY=sk-or-xxxxxx" -ForegroundColor Yellow
        exit 1
    }
    Remove-Item Env:CLAUDE_CODE_USE_BEDROCK -ErrorAction SilentlyContinue
    $env:ANTHROPIC_BASE_URL = "https://openrouter.ai/api/v1"
    $env:ANTHROPIC_API_KEY  = $orKey
    $env:ANTHROPIC_MODEL    = "anthropic/claude-3-haiku:free"   # Best free Claude on OpenRouter
    Write-Host ""
    Write-Host "Launching Claude via OpenRouter (FREE tier)..." -ForegroundColor Yellow
    Write-Host "  Endpoint : https://openrouter.ai/api/v1" -ForegroundColor Cyan
    Write-Host "  Model    : anthropic/claude-3-haiku:free" -ForegroundColor Cyan
    Write-Host "  Limit    : 50 req/day free | type /model to switch" -ForegroundColor DarkGray
    Write-Host ""
} elseif ($OmniRoute) {
    # ── OmniRoute mode: proxy through local AI gateway (auto-fallback between models) ──
    $omniStatus = try { (Invoke-WebRequest "http://localhost:20128" -UseBasicParsing -TimeoutSec 3).StatusCode } catch { 0 }
    if ($omniStatus -ne 200) {
        Write-Host "WARNING: OmniRoute not running at localhost:20128" -ForegroundColor Yellow
        Write-Host "Start it with: omniroute  (in a separate terminal)" -ForegroundColor Yellow
        Write-Host "Or open: http://localhost:20128" -ForegroundColor Yellow
        exit 1
    }
    # Unset Bedrock flags — use OmniRoute as OpenAI-compatible proxy instead
    Remove-Item Env:CLAUDE_CODE_USE_BEDROCK -ErrorAction SilentlyContinue
    $env:ANTHROPIC_BASE_URL = "http://localhost:20128/v1"
    $env:ANTHROPIC_API_KEY  = "omniroute"   # OmniRoute accepts any key locally
    $env:ANTHROPIC_MODEL    = "claude-sonnet-4-6"  # OmniRoute maps this to Bedrock
    Write-Host ""
    Write-Host "Launching Claude via OmniRoute (auto-fallback)..." -ForegroundColor Magenta
    Write-Host "  Gateway : http://localhost:20128/v1" -ForegroundColor Cyan
    Write-Host "  Model   : claude-sonnet-4-6 (with fallback)" -ForegroundColor Cyan
    Write-Host ""
} else {
    # ── Direct Bedrock mode ──
    $env:CLAUDE_CODE_USE_BEDROCK        = "1"
    $env:ANTHROPIC_MODEL                = "us.anthropic.claude-sonnet-4-6"
    $env:AWS_REGION                     = "us-east-1"
    $env:AWS_DEFAULT_REGION             = "us-east-1"
    $env:CLAUDE_CODE_SKIP_BEDROCK_CHECK = "1"
    Write-Host ""
    Write-Host "Launching Claude via AWS Bedrock (direct)..." -ForegroundColor Green
    Write-Host "  Region  : $env:AWS_REGION"           -ForegroundColor Cyan
    Write-Host "  Key ID  : $($env:AWS_ACCESS_KEY_ID.Substring(0,8))..." -ForegroundColor Cyan
    Write-Host "  Model   : us.anthropic.claude-sonnet-4-6" -ForegroundColor Cyan
    Write-Host "  Tip     : Run '.\claude.ps1 -OmniRoute' if quota is hit" -ForegroundColor DarkGray
    Write-Host ""
}

claude
