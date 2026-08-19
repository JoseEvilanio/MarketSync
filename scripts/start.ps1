# ============================================================
# MercadoPro ERP - Iniciar Sistema
# ============================================================

$rootDir     = Split-Path $PSScriptRoot -Parent
$backendDir  = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"
$configFile  = Join-Path $backendDir "config\config.json"

# Ler porta da API do config.json (fallback: 3001)
$apiPorta = 3001
if (Test-Path $configFile) {
    try {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $apiPorta = $cfg.api.porta
    } catch {}
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║            Iniciando MercadoPro ERP...               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar PostgreSQL
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService -and $pgService.Status -ne "Running") {
    Write-Host "  ⚠  PostgreSQL não está rodando. Iniciando..." -ForegroundColor Yellow
    Start-Service $pgService.Name
    Start-Sleep -Seconds 2
}

# Iniciar backend
Write-Host "  ▶  Iniciando Backend (porta $apiPorta)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$backendDir'; `$host.UI.RawUI.WindowTitle = 'MercadoPro - Backend'; npm run dev" `
    -WindowStyle Normal

Start-Sleep -Seconds 3

# Iniciar frontend
Write-Host "  ▶  Iniciando Frontend (porta 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$frontendDir'; `$host.UI.RawUI.WindowTitle = 'MercadoPro - Frontend'; npm run dev" `
    -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "  ✔  Sistema iniciado!" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend API:  http://localhost:$apiPorta" -ForegroundColor Cyan
Write-Host "  Frontend:     http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Pressione qualquer tecla para abrir no navegador..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Abrir no Google Chrome (preferencial) ou fallback para o navegador padrão
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
    Start-Process $chrome "http://localhost:5173"
} else {
    Start-Process "http://localhost:5173"
}
