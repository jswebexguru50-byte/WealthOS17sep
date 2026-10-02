$ErrorActionPreference = "Stop"
cd "C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release"
try {
    .\cloudflared.exe service install
    Set-Content -Path install_service.log -Value "cloudflared installed successfully"
} catch {
    Set-Content -Path install_service.log -Value "Error: $_"
}
