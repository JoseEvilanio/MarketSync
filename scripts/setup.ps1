# ============================================================
# MarketSync ERP - Script de Configuração Inicial (Windows)
# ============================================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MarketSync ERP - Setup Inicial" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Verificar Node.js
Write-Host "`n[1/6] Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERRO: Node.js nao encontrado. Instale em https://nodejs.org (v18+)" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Verificar PostgreSQL
Write-Host "`n[2/6] Verificando PostgreSQL..." -ForegroundColor Yellow
$psql = psql --version 2>$null
if (-not $psql) {
    Write-Host "AVISO: psql nao encontrado no PATH. Certifique-se de que o PostgreSQL esta instalado." -ForegroundColor Yellow
} else {
    Write-Host "  PostgreSQL: $psql" -ForegroundColor Green
}

# Criar arquivo .env do backend
Write-Host "`n[3/6] Configurando variaveis de ambiente..." -ForegroundColor Yellow
$backendEnvPath = Join-Path $PSScriptRoot "..\backend\.env"
if (-not (Test-Path $backendEnvPath)) {
    Copy-Item (Join-Path $PSScriptRoot "..\backend\.env.example") $backendEnvPath
    Write-Host "  Arquivo .env criado em backend/.env" -ForegroundColor Green
    Write-Host "  IMPORTANTE: Edite backend/.env com sua senha do PostgreSQL!" -ForegroundColor Red
} else {
    Write-Host "  backend/.env ja existe, mantendo..." -ForegroundColor Green
}

# Instalar dependências backend
Write-Host "`n[4/6] Instalando dependencias do backend..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "..\backend")
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "Erro ao instalar backend" -ForegroundColor Red; exit 1 }

# Instalar dependências frontend
Write-Host "`n[5/6] Instalando dependencias do frontend..." -ForegroundColor Yellow
Set-Location (Join-Path $PSScriptRoot "..\frontend")
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "Erro ao instalar frontend" -ForegroundColor Red; exit 1 }

Write-Host "`n[6/6] Setup concluido!" -ForegroundColor Green
Write-Host @"

========================================
  Proximos Passos:
========================================
1. Edite backend/.env e configure DATABASE_URL com sua senha do PostgreSQL

2. Crie o banco de dados PostgreSQL:
   psql -U postgres -c "CREATE DATABASE mercadinho_db;"

3. Execute as migracoes:
   cd backend
   npx prisma migrate dev --name init
   npm run prisma:seed

4. Inicie o sistema:
   Execute: scripts\start.ps1

Credenciais padrao apos o seed:
   Admin:   admin@mercadinho.local   / admin123
   Gerente: gerente@mercadinho.local / gerente123
   Caixa:   caixa@mercadinho.local   / caixa123
========================================
"@ -ForegroundColor Cyan
