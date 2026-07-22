# ============================================================
# MercadoPro ERP - Desinstalador
# ============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

$rootDir    = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $rootDir "backend"
$configFile = Join-Path $backendDir "config\config.json"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║           MercadoPro ERP — Desinstalador                 ║" -ForegroundColor Red
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""
Write-Host "  Este script irá:" -ForegroundColor Yellow
Write-Host "    • Parar os processos do sistema" -ForegroundColor Yellow
Write-Host "    • Remover os atalhos da Área de Trabalho" -ForegroundColor Yellow
Write-Host "    • (opcional) Realizar um backup final" -ForegroundColor Yellow
Write-Host ""
Write-Host "  NÃO serão removidos:" -ForegroundColor Gray
Write-Host "    • O banco de dados PostgreSQL" -ForegroundColor Gray
Write-Host "    • Os arquivos de backup em $(if (Test-Path $configFile) { (Get-Content $configFile | ConvertFrom-Json).backup.diretorio } else { '../backups' })" -ForegroundColor Gray
Write-Host "    • Os arquivos do sistema (pasta do projeto)" -ForegroundColor Gray
Write-Host ""

$confirmar = Read-Host "  Confirma a desinstalação? (S/N)"
if ($confirmar -ne "S" -and $confirmar -ne "s") {
    Write-Host "  Operação cancelada." -ForegroundColor Gray
    exit 0
}

# ── 1. Backup final (opcional) ────────────────────────────────────────────────

$fazerBackup = Read-Host "  Deseja fazer um backup final antes de remover? (S/N)"
if ($fazerBackup -eq "S" -or $fazerBackup -eq "s") {
    Write-Host "  Executando backup final..." -ForegroundColor Cyan
    $apiPorta = 3001
    if (Test-Path $configFile) {
        try { $cfg = Get-Content $configFile -Raw | ConvertFrom-Json; $apiPorta = $cfg.api.porta } catch {}
    }
    try {
        # Tenta via pg_dump diretamente
        if (Test-Path $configFile) {
            $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
            $pgBins = @("C:\Program Files\PostgreSQL\17\bin","C:\Program Files\PostgreSQL\16\bin","C:\Program Files\PostgreSQL\15\bin","C:\Program Files\PostgreSQL\14\bin")
            $pgBin = $pgBins | Where-Object { Test-Path "$_\pg_dump.exe" } | Select-Object -First 1
            if ($pgBin) {
                $ts = (Get-Date).ToString("yyyy-MM-dd_HH-mm-ss")
                $backupFile = Join-Path $cfg.backup.diretorio "backup_final_$ts.sql"
                New-Item -ItemType Directory -Path $cfg.backup.diretorio -Force | Out-Null
                $env:PGPASSWORD = $cfg.database.senha
                & "$pgBin\pg_dump.exe" -h $cfg.database.host -p $cfg.database.porta -U $cfg.database.usuario -d $cfg.database.nome -f $backupFile 2>&1 | Out-Null
                $env:PGPASSWORD = ""
                if (Test-Path $backupFile) {
                    Write-Host "  ✔  Backup final salvo em: $backupFile" -ForegroundColor Green
                }
            }
        }
    } catch {
        Write-Host "  ⚠  Não foi possível realizar o backup final: $_" -ForegroundColor Yellow
    }
}

# ── 2. Parar processos ────────────────────────────────────────────────────────

Write-Host "  Parando processos do sistema..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  ✔  Processos encerrados" -ForegroundColor Green

# ── 3. Remover atalhos ────────────────────────────────────────────────────────

Write-Host "  Removendo atalhos..." -ForegroundColor Cyan
$desktop = [Environment]::GetFolderPath("Desktop")
$atalho  = Join-Path $desktop "MercadoPro ERP.lnk"
if (Test-Path $atalho) {
    Remove-Item $atalho -Force
    Write-Host "  ✔  Atalho da Área de Trabalho removido" -ForegroundColor Green
} else {
    Write-Host "  ℹ  Nenhum atalho encontrado" -ForegroundColor Gray
}

# ── Resumo ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ✔  Desinstalação concluída." -ForegroundColor Green
Write-Host ""
Write-Host "  Os arquivos do projeto e o banco de dados foram preservados." -ForegroundColor Gray
Write-Host "  Para remover completamente, exclua manualmente:" -ForegroundColor Gray
Write-Host "    • A pasta do projeto: $rootDir" -ForegroundColor Gray
Write-Host "    • O banco '$((if (Test-Path $configFile) { (Get-Content $configFile | ConvertFrom-Json).database.nome } else { 'mercadopro_db' }))' via pgAdmin" -ForegroundColor Gray
Write-Host ""
