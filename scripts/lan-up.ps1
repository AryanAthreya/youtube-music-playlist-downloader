[CmdletBinding()]
param(
    [switch]$Down
)

$ErrorActionPreference = "Stop"

if ($Down) {
    Write-Host "[LAN] Stopping LAN test containers..." -ForegroundColor Yellow
    docker compose down
    Write-Host "[OK] Containers stopped." -ForegroundColor Green
    exit 0
}

Write-Host "[LAN] Detecting primary LAN IP..." -ForegroundColor Cyan

# Find active adapter with an IPv4 default gateway, excluding virtual/container adapters
$lanAdapters = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and
    $_.InterfaceAlias -notmatch '(?i)(vEthernet|WSL|Docker|Tailscale|VPN|Loopback|Hyper-V)' -and
    $_.NetAdapter.Status -eq 'Up'
}

$lanIp = $null
if ($lanAdapters) {
    $lanIp = ($lanAdapters | Select-Object -ExpandProperty IPv4Address | Select-Object -ExpandProperty IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
}

if (-not $lanIp) {
    # Fallback to any active adapter with gateway
    $fallback = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
    if ($fallback) {
        $lanIp = $fallback.IPv4Address.IPAddress
    }
}

if (-not $lanIp) {
    Write-Host "[WARN] Could not automatically detect primary LAN IPv4. Defaulting to localhost." -ForegroundColor Yellow
    $lanIp = "localhost"
} else {
    Write-Host "[OK] Detected LAN IP: $lanIp" -ForegroundColor Green
}

# Check Windows Firewall rules for ports 3000 and 8000
$firewallOk = $false
try {
    $check3000 = netsh advfirewall firewall show rule name=all | Select-String "3000"
    $check8000 = netsh advfirewall firewall show rule name=all | Select-String "8000"
    if ($check3000 -and $check8000) {
        $firewallOk = $true
    }
} catch {
    # netsh query failed
}

if (-not $firewallOk) {
    Write-Host ""
    Write-Host "[FIREWALL CHECK]" -ForegroundColor Yellow
    Write-Host "Windows Firewall rules allowing inbound TCP 3000 and 8000 were not detected." -ForegroundColor Yellow
    Write-Host "If your phone cannot load the page, run this command in an Administrator PowerShell:" -ForegroundColor Yellow
    Write-Host "New-NetFirewallRule -DisplayName 'YTDL Player (LAN)' -Direction Inbound -LocalPort 3000,8000 -Protocol TCP -Action Allow" -ForegroundColor Cyan
    Write-Host ""
}

# Start containers with CORS_ALLOW_LAN enabled in current environment
Write-Host "[DOCKER] Launching Docker stack with CORS_ALLOW_LAN=true..." -ForegroundColor Cyan
$env:CORS_ALLOW_LAN = "true"
docker compose up --build -d

# Wait for backend health check
Write-Host "[HEALTH] Waiting for backend health check (http://localhost:8000/api/health)..." -NoNewline
$healthy = $false
$maxTries = 30
for ($i = 0; $i -lt $maxTries; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($resp.status -eq "ok" -or $resp.fastapi -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
    }
}
Write-Host ""

if ($healthy) {
    Write-Host ""
    Write-Host "[SUCCESS] App is ready for testing!" -ForegroundColor Green
    Write-Host "Local PC URL:  http://localhost:3000" -ForegroundColor White
    Write-Host "Phone/LAN URL: http://$($lanIp):3000" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To stop the stack, run: .\scripts\lan-down.ps1 (or .\scripts\lan-up.ps1 -Down)" -ForegroundColor Gray
} else {
    Write-Host "[ERROR] Backend did not become healthy within 30s. Check logs with: docker compose logs" -ForegroundColor Red
}
