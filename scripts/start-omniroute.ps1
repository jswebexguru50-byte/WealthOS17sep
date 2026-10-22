$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDirectory = Join-Path $projectRoot '.omniroute-data'
New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null

$env:DATA_DIR = $dataDirectory
$env:OMNIROUTE_DATA_DIR = $dataDirectory
$env:OMNIROUTE_SERVER_HOST = '127.0.0.1'
$env:OMNIROUTE_BASE_URL = 'http://127.0.0.1:20128'
$env:PORT = '20128'

& omniroute serve
