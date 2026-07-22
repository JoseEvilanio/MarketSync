# =============================================================
# MercadoPro ERP - Pipeline de Build do Instalador
# Gera: installer/MercadoPro_Setup_v{versao}.exe
#
# Pre-requisitos:
#   - NSIS 3.x instalado: https://nsis.sourceforge.io/Download
#   - Node.js (para o build do projeto)
#   - Acesso a internet na 1a execucao (baixa Node, NSSM, PG)
# =============================================================

param(
    [string]$Versao        = "",
    [string]$SkipBuilds    = "false",
    [string]$SkipDownloads = "false"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir      = Split-Path $PSScriptRoot -Parent
$backendDir   = Join-Path $rootDir "backend"
$frontendDir  = Join-Path $rootDir "frontend"
$installerDir = Join-Path $rootDir "installer"
$cacheDir     = Join-Path $installerDir "cache"
$stagingDir   = Join-Path $installerDir "staging"

function Write-Step { param([string]$msg) Write-Host ""; Write-Host "  >> $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  ERRO: $msg" -ForegroundColor Red; exit 1 }
function Write-Info { param([string]$msg) Write-Host "  -- $msg" -ForegroundColor Gray }

# --- Banner ---

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "     MercadoPro ERP - Build do Instalador Setup.exe         " -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

# --- Ler versao do package.json ---

if (-not $Versao) {
    $pkgJson = Get-Content (Join-Path $backendDir "package.json") -Raw | ConvertFrom-Json
    $Versao  = $pkgJson.version
}
Write-Host ""
Write-Host "  Versao: $Versao" -ForegroundColor Yellow
Write-Host ""

# --- Verificar pre-requisitos ---

Write-Step "Verificando pre-requisitos..."

try {
    $nodeVer = (node -v).TrimStart("v")
    Write-OK "Node.js v$nodeVer"
} catch {
    Write-Fail "Node.js nao encontrado. Instale em https://nodejs.org/"
}

# Localizar NSIS
$makensis = $null
$candidatos = @(
    "C:\Program Files (x86)\NSIS\makensis.exe",
    "C:\Program Files\NSIS\makensis.exe",
    "C:\NSIS\makensis.exe"
)
$fromPath = Get-Command makensis -ErrorAction SilentlyContinue
if ($fromPath) { $candidatos = @($fromPath.Source) + $candidatos }
foreach ($c in $candidatos) {
    if ($c -and (Test-Path $c)) { $makensis = $c; break }
}
if (-not $makensis) {
    Write-Fail "NSIS nao encontrado. Instale em https://nsis.sourceforge.io/Download"
}
$nsisDir = Split-Path $makensis
if ($env:PATH -notlike "*$nsisDir*") { $env:PATH += ";$nsisDir" }
$nsisVer = (& $makensis /VERSION 2>&1)
Write-OK "NSIS $nsisVer em: $makensis"

# Criar pastas e limpar instaladores antigos
Get-ChildItem $installerDir -Filter "MercadoPro_Setup_*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $cacheDir   | Out-Null
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

# --- 1. Build do frontend ---

if ($SkipBuilds -ne "true") {
    Write-Step "Build do frontend..."
    Push-Location $frontendDir
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "Falha no build do frontend" }
    Pop-Location
    Write-OK "Frontend buildado em backend/public/"
} else {
    Write-Info "Build do frontend ignorado (SkipBuilds=true)"
}

# --- 2. Parar backend em execucao (libera arquivos bloqueados) ---

Write-Step "Parando processos Node.js do projeto (se em execucao)..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdline = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmdline -like "*mercadinho*" -or $cmdline -like "*server.ts*" -or $cmdline -like "*server.js*") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-Info "Processo $($_.Id) encerrado"
    }
}
Start-Sleep -Seconds 2
Write-OK "Processos encerrados"

# --- 3. Compilar TypeScript PRIMEIRO (precisa das devDependencies) ---

Write-Step "Instalando todas as dependencias do backend (dev + prod)..."
Push-Location $backendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha no npm install do backend" }

Write-Step "Compilando backend TypeScript..."
$tscPath = Join-Path $backendDir "node_modules\.bin\tsc.cmd"
if (-not (Test-Path $tscPath)) { $tscPath = Join-Path $backendDir "node_modules\.bin\tsc" }
if (-not (Test-Path $tscPath)) { Write-Fail "TypeScript (tsc) nao encontrado em node_modules\.bin\" }
& $tscPath
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha no build TypeScript do backend" }
Write-OK "Backend compilado em backend/dist/"

# --- 4. Reinstalar apenas dependencias de producao (para o pacote final) ---

Write-Step "Instalando somente dependencias de producao (omit=dev)..."
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha no npm ci --omit=dev do backend" }
Pop-Location
Write-OK "node_modules de producao prontos"

# --- 5. Downloads de dependencias externas ---

# 4a. Node.js v22 portatil
$nodeZip     = Join-Path $cacheDir "node-v22-win-x64.zip"
$nodeVersion = "22.14.0"
$nodeUrl     = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"

if ((-not (Test-Path $nodeZip)) -or ($SkipDownloads -ne "true")) {
    Write-Step "Baixando Node.js v$nodeVersion portatil..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
    $nodeSizeMB = [math]::Round((Get-Item $nodeZip).Length / 1024 / 1024, 1)
    Write-OK "Node.js baixado: $nodeSizeMB MB"
} else {
    Write-Info "Node.js ja em cache: $nodeZip"
}

# 4b. NSSM
$nssmZip = Join-Path $cacheDir "nssm-2.24.zip"
$nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"

if (-not (Test-Path $nssmZip)) {
    Write-Step "Baixando NSSM..."
    Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
    Write-OK "NSSM baixado"
} else {
    Write-Info "NSSM ja em cache"
}

# 4c. PostgreSQL 16 installer (EDB)
$pgInstaller = Join-Path $cacheDir "postgresql-installer.exe"
$pgUrl       = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"

if (-not (Test-Path $pgInstaller)) {
    Write-Step "Baixando PostgreSQL 16 installer (aprox. 300 MB, pode demorar)..."
    Invoke-WebRequest -Uri $pgUrl -OutFile $pgInstaller -UseBasicParsing
    $pgSizeMB = [math]::Round((Get-Item $pgInstaller).Length / 1024 / 1024, 0)
    Write-OK "PostgreSQL installer baixado: $pgSizeMB MB"
} else {
    $pgSizeMB = [math]::Round((Get-Item $pgInstaller).Length / 1024 / 1024, 0)
    Write-Info "PostgreSQL installer ja em cache: $pgSizeMB MB"
}

# --- 6. Montar pasta staging/ ---

Write-Step "Montando estrutura de staging..."
Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

# 5a. Runtime/node
Write-Info "Extraindo Node.js portatil..."
$nodeStagingDir = Join-Path $stagingDir "Runtime\node"
New-Item -ItemType Directory -Force -Path $nodeStagingDir | Out-Null
Expand-Archive -Path $nodeZip -DestinationPath "$stagingDir\Runtime\_nodetmp" -Force
$nodeExtracted = Get-ChildItem "$stagingDir\Runtime\_nodetmp" -Directory | Select-Object -First 1
Copy-Item -Recurse "$($nodeExtracted.FullName)\*" $nodeStagingDir -Force
Remove-Item -Recurse -Force "$stagingDir\Runtime\_nodetmp"
Write-OK "Node.js extraido"

# 5b. Backend
Write-Info "Copiando backend..."
$backendStaging = Join-Path $stagingDir "Backend"
New-Item -ItemType Directory -Force -Path $backendStaging | Out-Null
Copy-Item -Recurse (Join-Path $backendDir "dist")         "$backendStaging\dist"
Copy-Item -Recurse (Join-Path $backendDir "node_modules") "$backendStaging\node_modules"
Copy-Item -Recurse (Join-Path $backendDir "prisma")       "$backendStaging\prisma"
Copy-Item          (Join-Path $backendDir "package.json") "$backendStaging\package.json"
New-Item -ItemType Directory -Force -Path "$backendStaging\config" | Out-Null
Copy-Item (Join-Path $backendDir "config\config.example.json") "$backendStaging\config\config.example.json"
Write-OK "Backend copiado"

# 5c. Frontend build
Write-Info "Copiando frontend build..."
$frontendStaging = Join-Path $stagingDir "Frontend"
Copy-Item -Recurse (Join-Path $backendDir "public") $frontendStaging
Write-OK "Frontend copiado"

# 5d. Tools (NSSM)
Write-Info "Extraindo NSSM..."
$toolsStaging = Join-Path $stagingDir "Tools"
New-Item -ItemType Directory -Force -Path $toolsStaging | Out-Null
Expand-Archive -Path $nssmZip -DestinationPath "$stagingDir\_nssm_tmp" -Force
$nssmExe = Get-ChildItem "$stagingDir\_nssm_tmp" -Recurse -Filter "nssm.exe" |
    Where-Object { $_.DirectoryName -like "*win64*" } | Select-Object -First 1
if (-not $nssmExe) {
    $nssmExe = Get-ChildItem "$stagingDir\_nssm_tmp" -Recurse -Filter "nssm.exe" | Select-Object -First 1
}
Copy-Item $nssmExe.FullName "$toolsStaging\nssm.exe"
Remove-Item -Recurse -Force "$stagingDir\_nssm_tmp"
Write-OK "NSSM extraido"

# 6e. PostgreSQL installer
Write-Info "Copiando PostgreSQL installer..."
$pgStagingDir = Join-Path $stagingDir "pg-installer"
New-Item -ItemType Directory -Force -Path $pgStagingDir | Out-Null
Copy-Item $pgInstaller "$pgStagingDir\postgresql-installer.exe"
Write-OK "PostgreSQL installer copiado"

# 6f. Script de configuracao do banco
Write-Info "Copiando setup-db.ps1..."
Copy-Item (Join-Path $installerDir "setup-db.ps1") (Join-Path $installerDir "staging_setup-db.ps1") -ErrorAction SilentlyContinue
# O arquivo fica na raiz do installerDir para o NSIS incluir com File "setup-db.ps1"
Write-OK "setup-db.ps1 copiado"

# 6f. Assets
Write-Info "Copiando assets..."
$assetsStagingDir = Join-Path $stagingDir "assets"
New-Item -ItemType Directory -Force -Path $assetsStagingDir | Out-Null
Copy-Item -Recurse (Join-Path $installerDir "assets\*") $assetsStagingDir -Exclude "*.ps1"
Write-OK "Assets copiados"

# --- 7. Verificar e gerar assets obrigatorios ---

$logoIco = Join-Path $installerDir "assets\logo.ico"
if (-not (Test-Path $logoIco) -or (Get-Item $logoIco).Length -lt 100) {
    Write-Info "Gerando logo.ico placeholder..."
    powershell -ExecutionPolicy Bypass -File (Join-Path $installerDir "assets\gerar-ico.ps1")
}

$welcomeBmp = Join-Path $installerDir "assets\welcome.bmp"
if (-not (Test-Path $welcomeBmp) -or (Get-Item $welcomeBmp).Length -lt 100) {
    Write-Info "Gerando welcome.bmp placeholder..."
    powershell -ExecutionPolicy Bypass -File (Join-Path $installerDir "assets\gerar-bmp.ps1")
}

Write-OK "Assets prontos"

# --- 8. Compilar com NSIS ---

Write-Step "Compilando instalador com NSIS..."
Push-Location $installerDir

$outExe = "MercadoPro_Setup_v${Versao}.exe"
& $makensis /DVERSION=$Versao MercadoPro.nsi

if ($LASTEXITCODE -ne 0) { Write-Fail "Falha na compilacao NSIS. Verifique os logs acima." }
Pop-Location

# --- Restaurar devDependencies no backend local ---
Write-Step "Restaurando dependencias de desenvolvimento no backend..."
Push-Location $backendDir
npm install --silent
Pop-Location
Write-OK "Dependencias de desenvolvimento restauradas"

# --- Resumo ---

$exePath   = Join-Path $installerDir $outExe
$exeSizeMB = [math]::Round((Get-Item $exePath).Length / 1024 / 1024, 1)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Instalador gerado com sucesso!" -ForegroundColor Green
Write-Host "  Arquivo : $outExe" -ForegroundColor Green
Write-Host "  Tamanho : $exeSizeMB MB" -ForegroundColor Green
Write-Host "  Local   : $installerDir\" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
