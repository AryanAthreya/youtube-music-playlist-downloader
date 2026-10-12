[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "[LAN] Stopping LAN test containers..." -ForegroundColor Yellow
docker compose down
Write-Host "[OK] Containers stopped." -ForegroundColor Green
