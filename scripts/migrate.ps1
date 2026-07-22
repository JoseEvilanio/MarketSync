# ============================================================
# MarketSync ERP - Executar Migrations e Seed
# ============================================================
Write-Host "Executando migrations..." -ForegroundColor Yellow
$backendDir = Join-Path (Split-Path $PSScriptRoot -Parent) "backend"
Set-Location $backendDir

Write-Host "[1/3] Gerando cliente Prisma..."
npx prisma generate

Write-Host "[2/3] Executando migrations..."
npx prisma migrate dev --name init

Write-Host "[3/3] Populando dados iniciais (seed)..."
npm run prisma:seed

Write-Host "Migrations concluidas!" -ForegroundColor Green
