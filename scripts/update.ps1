# ============================================================
# MercadoPro ERP - Atualizador do Sistema
# ============================================================
# Uso:
#   .\update.ps1                        (atualiza do diretório atual)
#   .\update.ps1 -PacoteZip "C:\novo.zip"  (extrai novo pacote antes)
# ============================================================

param(
    [string]$PacoteZip = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir     = Split-Path $PSScriptRoot -Parent
$backendDir  = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"
$configFile  = Join-Path $backendDir "config\config.json"

function Write-Step { param([string]$msg) Write-Host "  ▶  $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  ✖  ERRO: $msg" -ForegroundColor Red; exit 1 }

# Ler configuração
$apiPorta = 3001
if (Test-Path $configFile) {
    try { $cfg = Get-Content $configFile -Raw | ConvertFrom-Json; $apiPorta = $cfg.api.porta } catch {}
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           MercadoPro ERP — Atualizador                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verificar sistema em execução ─────────────────────────────────────────

Write-Step "Verificando sistema em execução..."
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$apiPorta/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  Sistema rodando: v$($health.versao)" -ForegroundColor Yellow
} catch {
    Write-Host "  Sistema não está rodando (OK para atualização offline)" -ForegroundColor Gray
}

# ── 2. Criar backup antes de atualizar ───────────────────────────────────────

Write-Step "Criando backup de segurança antes da atualização..."
try {
    # Tentar via API se disponível
    $stored = Get-Content "$env:APPDATA\MercadoPro\auth.json" -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($stored -and $stored.token) {
        Invoke-RestMethod -Uri "http://localhost:$apiPorta/api/backup/executar" `
            -Method POST -Headers @{ Authorization = "Bearer $($stored.token)" } -TimeoutSec 60 | Out-Null
        Write-OK "Backup realizado via API"
    } else {
        Write-Host "  ⚠  Backup manual recomendado antes de prosseguir." -ForegroundColor Yellow
        $continuar = Read-Host "  Continuar sem backup? (S/N)"
        if ($continuar -ne "S" -and $continuar -ne "s") { Write-Fail "Atualização cancelada pelo usuário" }
    }
} catch {
    Write-Host "  ⚠  Não foi possível fazer backup automático. Recomendado fazer manualmente." -ForegroundColor Yellow
    $continuar = Read-Host "  Continuar mesmo assim? (S/N)"
    if ($continuar -ne "S" -and $continuar -ne "s") { Write-Fail "Atualização cancelada" }
}

# ── 3. Parar processos Node.js do projeto ────────────────────────────────────

Write-Step "Parando processos do sistema..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*MercadoPro*" -or $_.CommandLine -like "*mercadinho*"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-OK "Processos encerrados"

# ── 4. Extrair novo pacote (se fornecido) ─────────────────────────────────────

if ($PacoteZip -and (Test-Path $PacoteZip)) {
    Write-Step "Extraindo novo pacote..."
    # Preservar config.json e backups
    $tempConfig = [System.IO.Path]::GetTempFileName() + ".json"
    if (Test-Path $configFile) { Copy-Item $configFile $tempConfig }

    Expand-Archive -Path $PacoteZip -DestinationPath $rootDir -Force
    Write-OK "Pacote extraído"

    # Restaurar config.json
    if (Test-Path $tempConfig) {
        New-Item -ItemType Directory -Path (Join-Path $backendDir "config") -Force | Out-Null
        Copy-Item $tempConfig $configFile -Force
        Remove-Item $tempConfig
        Write-OK "Configurações preservadas"
    }
}

# ── 5. Instalar dependências ──────────────────────────────────────────────────

Write-Step "Atualizando dependências do backend..."
Push-Location $backendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependências do backend" }
Write-OK "Backend OK"
Pop-Location

Write-Step "Atualizando dependências do frontend..."
Push-Location $frontendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependências do frontend" }
Write-OK "Frontend OK"
Pop-Location

# ── 6. Executar migrações ─────────────────────────────────────────────────────

Write-Step "Executando migrações do banco..."
Push-Location $backendDir
npx prisma generate 2>&1 | Out-Null
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha nas migrações. Restaure o backup antes de tentar novamente." }
Write-OK "Migrações aplicadas"
Pop-Location

# ── 7. Reiniciar sistema ──────────────────────────────────────────────────────

Write-Step "Reiniciando o sistema..."
Start-Sleep -Seconds 1
& "$PSScriptRoot\start.ps1"

# ── 8. Verificar health após reinício ────────────────────────────────────────

Start-Sleep -Seconds 6
Write-Step "Verificando integridade após atualização..."
try {
    $health = Invoke-RestMethod -Uri "http://localhost:$apiPorta/health" -TimeoutSec 10 -ErrorAction Stop
    Write-OK "Sistema funcionando: v$($health.versao) — banco: $($health.banco)"
} catch {
    Write-Host "  ⚠  Não foi possível verificar health. Verifique o sistema manualmente." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  ✔  Atualização concluída!" -ForegroundColor Green
Write-Host ""
