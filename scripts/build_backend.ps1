# Build the FastAPI backend as a single-file exe with PyInstaller.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

$out = Join-Path $root "backend_dist"
New-Item -ItemType Directory -Force -Path $out | Out-Null

& $py -m PyInstaller `
  --noconfirm `
  --onefile `
  --name disk_cleanup_backend `
  --paths . `
  --distpath $out `
  --workpath (Join-Path $root "build\pyinstaller") `
  --specpath (Join-Path $root "build") `
  backend_launcher.py

Write-Host "backend exe -> $out\disk_cleanup_backend.exe"