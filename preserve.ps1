$reports = "reports/v65-delivery-2.2"
$preserved = "evidence/wave-3.9-preserved"

Copy-Item -Path "$reports/WAVE3_7_TYPESCRIPT_EVIDENCE.json" -Destination "$preserved/02_TYPESCRIPT/WAVE3_9_TYPESCRIPT_EVIDENCE.json" -ErrorAction SilentlyContinue
Copy-Item -Path "$reports/WAVE3_7_DEF004_STATUS.json" -Destination "$preserved/04_DEF004/WAVE3_9_DEF004_STATUS.json" -ErrorAction SilentlyContinue
Copy-Item -Path "$reports/WAVE3_7_REGRESSION_EVIDENCE.json" -Destination "$preserved/07_REGRESSION/WAVE3_9_REGRESSION_EVIDENCE.json" -ErrorAction SilentlyContinue
Copy-Item -Path "$reports/WAVE3_7_REQUIREMENTS_TRACEABILITY.json" -Destination "$preserved/06_REQUIREMENTS/WAVE3_9_REQUIREMENTS_TRACEABILITY.json" -ErrorAction SilentlyContinue
Copy-Item -Path "$reports/PRODUCTION_READINESS_GATE.json" -Destination "$preserved/11_FINAL_GATE/PRODUCTION_READINESS_GATE_FINAL.json" -ErrorAction SilentlyContinue

# Hash generation for everything in the preserved folder
$manifestPath = "$preserved/00_SOURCE_STATE/EVIDENCE_MANIFEST.json"
$files = Get-ChildItem -Path $preserved -Recurse -File | Where-Object { $_.FullName -notmatch "EVIDENCE_MANIFEST.json" -and $_.FullName -notmatch "EVIDENCE_MANIFEST.sha256" -and $_.FullName -notmatch "SOURCE_SNAPSHOT.json" }

$manifest = @()
foreach ($file in $files) {
    $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
    $manifest += @{
        path = $file.FullName.Replace((Resolve-Path .).Path + "\", "").Replace("\", "/")
        sha256 = $hash
        sizeBytes = $file.Length
        sourceCommit = "8b74d8b4977e4ccccc040f7ac7e19f39986a6b1c"
        executionCommit = "8b74d8b4977e4ccccc040f7ac7e19f39986a6b1c"
        executionTimestamp = (Get-Date -Format "o")
        workingTreeState = "DIRTY"
        originalLocation = "UNKNOWN"
    }
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $manifestPath
$manifestHash = (Get-FileHash $manifestPath -Algorithm SHA256).Hash
Set-Content -Path "$preserved/00_SOURCE_STATE/EVIDENCE_MANIFEST.sha256" -Value $manifestHash
