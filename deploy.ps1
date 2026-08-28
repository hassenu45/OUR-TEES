# AZMA Auto-Deploy Script
# Usage: npm run deploy  (or: .\deploy.ps1)
# Uploads the whole project to Railway and waits for the build.

$ErrorActionPreference = "Stop"

Write-Host "`n[1/4] Checking Railway login..." -ForegroundColor Cyan
$me = railway whoami 2>&1 | Out-String
if ($me -match "Logged in") {
  Write-Host "  OK: $me" -ForegroundColor Green
} else {
  Write-Host "  Not logged in. Run: railway login --browserless" -ForegroundColor Yellow
  railway login --browserless
}

Write-Host "`n[2/4] Uploading files to Railway..." -ForegroundColor Cyan
railway up --service azma-web 2>&1 | Select-Object -Last 5

Write-Host "`n[3/4] Waiting for build & deploy..." -ForegroundColor Cyan
Start-Sleep -Seconds 15
$attempts = 0
while ($attempts -lt 24) {
  Start-Sleep -Seconds 10
  $logs = railway logs --service azma-web 2>&1 | Out-String
  if ($logs -match "AZMA running") {
    Write-Host "  Server is UP!" -ForegroundColor Green
    break
  }
  if ($logs -match "Build Failed|Build Failed") {
    Write-Host "  Build FAILED - see logs above." -ForegroundColor Red
    break
  }
  $attempts++
}

Write-Host "`n[4/4] Final check..." -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri "https://azma-web-production.up.railway.app/" -UseBasicParsing -TimeoutSec 20
  Write-Host "  Site status: $($r.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "  Site not reachable yet - wait a moment." -ForegroundColor Yellow
}

Write-Host "`nDone!" -ForegroundColor Green
