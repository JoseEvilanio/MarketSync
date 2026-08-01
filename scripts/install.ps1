# ============================================================
# MercadoPro ERP - Script de Instalação Automatizada
# ============================================================
# Uso:
#   .\install.ps1
#   .\install.ps1 -Empresa "Meu Mercado" -PgSenha "senha123" -PgUsuario "postgres"
# ============================================================

param(
    [string]$Empresa    = "",
    [string]$PgHost     = "localhost",
    [string]$PgPorta    = "5432",
    [string]$PgUsuario  = "postgres",
    [string]$PgSenha    = "",
    [string]$PgBanco    = "mercadopro_db",
    [string]$BackupDir  = "",
    [string]$ApiPorta   = "3001"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir    = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $rootDir "backend"
$frontendDir= Join-Path $rootDir "frontend"

# ── Funções auxiliares ────────────────────────────────────────────────────────

function Write-Step { param([string]$msg)
    Write-Host ""
    Write-Host "  ▶  $msg" -ForegroundColor Cyan
}

function Write-OK { param([string]$msg)
    Write-Host "  ✔  $msg" -ForegroundColor Green
}

function Write-Fail { param([string]$msg)
    Write-Host ""
    Write-Host "  ✖  ERRO: $msg" -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Find-PgBin {
    # Tenta localizar os binários do PostgreSQL no Windows
    $candidatos = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin"
    )
    foreach ($dir in $candidatos) {
        if (Test-Path "$dir\psql.exe") { return $dir }
    }
    # Tenta via PATH
    try {
        $psqlPath = (Get-Command psql -ErrorAction Stop).Source
        return Split-Path $psqlPath
    } catch {}
    return $null
}

# ── Banner ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          MercadoPro ERP — Instalação Automatizada        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verificar Node.js ──────────────────────────────────────────────────────

Write-Step "Verificando Node.js..."
try {
    $nodeVer = (node -v 2>&1).ToString().TrimStart("v")
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -lt 18) { Write-Fail "Node.js $nodeVer encontrado, mas versão 18+ é necessária. Instale em https://nodejs.org/" }
    Write-OK "Node.js v$nodeVer"
} catch {
    Write-Fail "Node.js não encontrado. Instale em https://nodejs.org/ e reinicie o PowerShell."
}

# ── 2. Verificar PostgreSQL ───────────────────────────────────────────────────

Write-Step "Verificando PostgreSQL..."
$pgBin = Find-PgBin
if (-not $pgBin) { Write-Fail "PostgreSQL não encontrado. Instale em https://www.postgresql.org/download/windows/" }

$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pgService) { Write-Fail "Serviço do PostgreSQL não encontrado. Verifique a instalação." }
if ($pgService.Status -ne "Running") {
    Write-Host "  ⚠  PostgreSQL não está rodando. Tentando iniciar..." -ForegroundColor Yellow
    Start-Service $pgService.Name
    Start-Sleep -Seconds 3
}
Write-OK "PostgreSQL ($($pgService.Name)) rodando"

# ── 3. Coletar parâmetros interativamente se necessário ───────────────────────

Write-Step "Configuração da instalação..."

if (-not $PgSenha) {
    $PgSenha = Read-Host "  Senha do usuário PostgreSQL '$PgUsuario'"
}
if (-not $Empresa) {
    $Empresa = Read-Host "  Nome da empresa (ex: Mercadinho São José)"
    if (-not $Empresa) { $Empresa = "Mercadinho Local" }
}
if (-not $BackupDir) {
    $defaultBackup = Join-Path $rootDir "backups"
    $inputDir = Read-Host "  Diretório de backup [$defaultBackup]"
    $BackupDir = if ($inputDir) { $inputDir } else { $defaultBackup }
}

# ── 4. Testar conexão com PostgreSQL ─────────────────────────────────────────

Write-Step "Testando conexão com o banco..."
$env:PGPASSWORD = $PgSenha
try {
    $null = & "$pgBin\psql.exe" -h $PgHost -p $PgPorta -U $PgUsuario -d postgres -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "Não foi possível conectar ao PostgreSQL. Verifique usuário e senha." }
    Write-OK "Conexão com PostgreSQL OK"
} catch {
    Write-Fail "Erro ao conectar: $_"
}

# ── 5. Criar banco de dados ───────────────────────────────────────────────────

Write-Step "Verificando banco de dados '$PgBanco'..."
$exists = & "$pgBin\psql.exe" -h $PgHost -p $PgPorta -U $PgUsuario -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PgBanco';" 2>&1
if ($exists -match "1") {
    Write-OK "Banco '$PgBanco' já existe"
} else {
    Write-Host "  Criando banco '$PgBanco'..." -ForegroundColor Yellow
    & "$pgBin\psql.exe" -h $PgHost -p $PgPorta -U $PgUsuario -d postgres -c "CREATE DATABASE `"$PgBanco`";" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao criar banco '$PgBanco'" }
    Write-OK "Banco '$PgBanco' criado"
}
$env:PGPASSWORD = ""

# ── 6. Gerar config.json ──────────────────────────────────────────────────────

Write-Step "Gerando arquivo de configuração..."
$configDir = Join-Path $backendDir "config"
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir | Out-Null }

$backupDirJson = $BackupDir.Replace("\", "\\")

$config = @"
{
  "empresa": "$Empresa",
  "api": {
    "host": "localhost",
    "porta": $ApiPorta
  },
  "database": {
    "host": "$PgHost",
    "porta": $PgPorta,
    "nome": "$PgBanco",
    "usuario": "$PgUsuario",
    "senha": "$PgSenha"
  },
  "backup": {
    "diretorio": "$backupDirJson",
    "hora": "22:00",
    "maximo": 30
  },
  "impressora": {
    "cupom": "",
    "etiquetas": ""
  },
  "sistema": {
    "primeiroAcesso": false,
    "versao": "1.0.4",
    "logDir": "../logs"
  }
}
"@

Set-Content -Path (Join-Path $configDir "config.json") -Value $config -Encoding UTF8
Write-OK "config.json gerado em $configDir"

# ── 7. Gerar .env mínimo (para Prisma CLI) ────────────────────────────────────

$dbUrl = "postgresql://${PgUsuario}:${PgSenha}@${PgHost}:${PgPorta}/${PgBanco}"
$envContent = @"
DATABASE_URL="$dbUrl"
JWT_SECRET="mercadopro_jwt_$(Get-Random -Maximum 999999)_secret_forte"
JWT_EXPIRES_IN="8h"
PORT=$ApiPorta
NODE_ENV=development
BACKUP_DIR="$($BackupDir.Replace('\','/'))"
"@

Set-Content -Path (Join-Path $backendDir ".env") -Value $envContent -Encoding UTF8
Write-OK ".env gerado"

# ── 8. Instalar dependências ──────────────────────────────────────────────────

Write-Step "Instalando dependências do backend..."
Push-Location $backendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependências do backend" }
Write-OK "Dependências do backend instaladas"
Pop-Location

Write-Step "Instalando dependências do frontend..."
Push-Location $frontendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependências do frontend" }
Write-OK "Dependências do frontend instaladas"
Pop-Location

# ── 9. Prisma migrate deploy ──────────────────────────────────────────────────

Write-Step "Executando migrações do banco..."
Push-Location $backendDir
npx prisma generate 2>&1 | Out-Null
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha nas migrações do Prisma" }
Write-OK "Migrações aplicadas"
Pop-Location

# ── 10. Seed inicial ──────────────────────────────────────────────────────────

Write-Step "Populando dados iniciais..."
Push-Location $backendDir
npx tsx src/prisma/seed.ts
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha no seed do banco" }
Write-OK "Dados iniciais inseridos"
Pop-Location

# ── 11. Criar atalho na Área de Trabalho ─────────────────────────────────────

Write-Step "Criando atalho na Área de Trabalho..."
try {
    $desktop     = [Environment]::GetFolderPath("Desktop")
    $startScript = Join-Path $PSScriptRoot "start.ps1"
    $shell       = New-Object -ComObject WScript.Shell
    $atalho      = $shell.CreateShortcut("$desktop\MercadoPro ERP.lnk")
    $atalho.TargetPath       = "powershell.exe"
    $atalho.Arguments        = "-ExecutionPolicy Bypass -File `"$startScript`""
    $atalho.WorkingDirectory = $PSScriptRoot
    $atalho.Description      = "MercadoPro ERP Local"
    $atalho.IconLocation     = "shell32.dll,175"
    $atalho.Save()
    Write-OK "Atalho criado em: $desktop\MercadoPro ERP.lnk"
} catch {
    Write-Host "  ⚠  Não foi possível criar atalho: $_" -ForegroundColor Yellow
}

# ── Resumo final ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║             Instalação concluída com sucesso!            ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Para iniciar o sistema:                                 ║" -ForegroundColor Green
Write-Host "║    .\scripts\start.ps1                                   ║" -ForegroundColor Green
Write-Host "║    ou use o atalho na Área de Trabalho                   ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Acesso:  http://localhost:$ApiPorta (API)                   ║" -ForegroundColor Green
Write-Host "║           http://localhost:5173 (Sistema)                ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Credenciais padrão:                                     ║" -ForegroundColor Green
Write-Host "║    Admin:   admin@mercadinho.local   / admin123          ║" -ForegroundColor Green
Write-Host "║    Gerente: gerente@mercadinho.local / gerente123        ║" -ForegroundColor Green
Write-Host "║    Caixa:   caixa@mercadinho.local   / caixa123          ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║  ⚠  Altere as senhas padrão após o primeiro acesso!     ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
