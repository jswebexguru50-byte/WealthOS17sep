$file = Resolve-Path "scripts\mcp\start_review_gateway.ps1"
$errors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)

if ($errors -and $errors.Count -gt 0) {
    Write-Host "POWERSHELL_PARSE=FAIL"
    $errors | ForEach-Object { Write-Host "Error at line $($_.Extent.StartLineNumber): $($_.Message)" }
    exit 1
} else {
    Write-Host "POWERSHELL_PARSE=PASS"
    exit 0
}
