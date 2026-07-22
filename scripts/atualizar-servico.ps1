# =============================================================
# MercadoPro ERP - Atualizar servico com novo build
# Execute como Administrador
# =============================================================

$srcDir  = Split-Path $PSScriptRoot -Parent
$instDir = "C:\Program Files\MercadoPro"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MercadoPro ERP - Atualizando servico..."                    -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Parar servico ---
Write-Host "  Parando servico MercadoProService..." -ForegroundColor Yellow
Stop-Service "MercadoProService" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-Host "  OK" -ForegroundColor Green

# --- 2. Copiar novo dist/ ---
Write-Host "  Copiando novo backend compilado..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "$srcDir\backend\dist\*" "$instDir\Backend\dist\"
Write-Host "  OK" -ForegroundColor Green

# --- 3. Copiar public/ (frontend build) ---
Write-Host "  Copiando frontend build..." -ForegroundColor Yellow
if (-not (Test-Path "$instDir\Backend\public")) {
    New-Item -ItemType Directory -Force -Path "$instDir\Backend\public" | Out-Null
}
Copy-Item -Recurse -Force "$srcDir\backend\public\*" "$instDir\Backend\public\"
Write-Host "  OK" -ForegroundColor Green

# --- 4. Reiniciar servico ---
Write-Host "  Iniciando servico..." -ForegroundColor Yellow
Start-Service "MercadoProService"
Start-Sleep -Seconds 4

# --- 5. Verificar health ---
Write-Host "  Verificando sistema..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 10
    Write-Host ""
    Write-Host "  Sistema OK!" -ForegroundColor Green
    Write-Host "  Versao : $($health.versao)" -ForegroundColor Cyan
    Write-Host "  Banco  : $($health.banco)"  -ForegroundColor Cyan
    Write-Host "  URL    : http://localhost:3001" -ForegroundColor Cyan

    # Verificar se frontend esta sendo servido
    try {
        $idx = Invoke-WebRequest -Uri "http://localhost:3001/" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  Frontend: OK ($($idx.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "  Frontend: AVISO - verifique se public/index.html existe" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  AVISO: sistema ainda iniciando, aguarde alguns segundos" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Acesse: http://localhost:3001" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Pressione qualquer tecla para fechar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
