# =============================================================
# MercadoPro ERP - Configuracao do Banco de Dados
# Chamado pelo instalador NSIS
# =============================================================

param(
    [string]$SenhaApp = "",
    [string]$PgBinDir = "",
    [string]$InstDir  = "C:\Program Files\MercadoPro"
)

$ErrorActionPreference = "Continue"

# --- Garantir pasta de logs (usa TEMP se sem permissao em Program Files) ---
$logsDir = Join-Path $InstDir "Logs"
try {
    New-Item -ItemType Directory -Force -Path $logsDir -ErrorAction Stop | Out-Null
} catch {
    $logsDir = $env:TEMP
}
$logFile = Join-Path $logsDir "mercadopro-setup-db.log"

function Write-Log {
    param([string]$msg, [string]$nivel = "INFO")
    $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$nivel] $msg"
    Write-Host $linha
    try { Add-Content -Path $logFile -Value $linha -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}

function Invoke-Psql {
    param([string]$senha, [string]$sql)
    $env:PGPASSWORD = $senha
    $out = & $psql -U postgres -d postgres -c $sql 2>&1
    $code = $LASTEXITCODE
    $env:PGPASSWORD = ""
    return @{ Code = $code; Output = ($out -join " ") }
}

function Invoke-PsqlQuery {
    param([string]$senha, [string]$query)
    $env:PGPASSWORD = $senha
    $out = & $psql -U postgres -d postgres -tAc $query 2>&1
    $code = $LASTEXITCODE
    $env:PGPASSWORD = ""
    return @{ Code = $code; Output = ($out -join " ").Trim() }
}

Write-Log "Iniciando configuracao do banco de dados..."
Write-Log "InstDir: $InstDir"
Write-Log "PgBinDir recebido: $PgBinDir"

# --- Localizar psql ---
if (-not $PgBinDir -or -not (Test-Path "$PgBinDir\psql.exe")) {
    $candidatos = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin"
    )
    foreach ($c in $candidatos) {
        if (Test-Path "$c\psql.exe") { $PgBinDir = $c; break }
    }
}

if (-not (Test-Path "$PgBinDir\psql.exe")) {
    Write-Log "ERRO: psql.exe nao encontrado. PgBinDir=$PgBinDir" "ERROR"
    exit 1
}

$psql = "$PgBinDir\psql.exe"
Write-Log "psql localizado: $psql"

# --- Encontrar senha do postgres ---
Write-Log "Testando autenticacao..."
$senhaPg = $null
$senhasParaTestar = @("postgres", "admin", "1234", "123456", "")

foreach ($s in $senhasParaTestar) {
    $env:PGPASSWORD = $s
    $out = & $psql -U postgres -d postgres -c "SELECT 1;" 2>&1
    $env:PGPASSWORD = ""
    if ($LASTEXITCODE -eq 0) {
        $senhaPg = $s
        Write-Log "Autenticacao bem-sucedida (senha: '$s')"
        break
    }
}

# Se nao encontrou senha, pedir ao usuario
if ($null -eq $senhaPg) {
    Write-Log "Nenhuma senha padrao funcionou. Abrindo caixa de dialogo..." "WARN"
    Add-Type -AssemblyName Microsoft.VisualBasic
    $senhaPg = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Nao foi possivel conectar ao PostgreSQL automaticamente.`n`nInforme a senha do usuario 'postgres':",
        "MercadoPro - Configuracao do Banco",
        ""
    )
    # Testar a senha informada
    $env:PGPASSWORD = $senhaPg
    $out = & $psql -U postgres -d postgres -c "SELECT 1;" 2>&1
    $env:PGPASSWORD = ""
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Senha incorreta informada pelo usuario" "ERROR"
        exit 1
    }
    Write-Log "Autenticacao bem-sucedida com senha informada pelo usuario"
}

# --- Gerar senha para usuario da aplicacao ---
if (-not $SenhaApp) {
    $chars   = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $SenhaApp = -join (1..16 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    Write-Log "Senha da aplicacao gerada: $SenhaApp"
}

# --- Criar usuario 'mercado' ---
Write-Log "Verificando usuario 'mercado'..."
$env:PGPASSWORD = $senhaPg
$checkUser = (& $psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM pg_roles WHERE rolname='mercado';" 2>&1) -join ""
$env:PGPASSWORD = ""
Write-Log "Resultado verificacao usuario: '$checkUser'"

$env:PGPASSWORD = $senhaPg
if ($checkUser.Trim() -eq "0" -or $checkUser.Trim() -eq "") {
    Write-Log "Criando usuario 'mercado'..."
    $out = & $psql -U postgres -d postgres -c "CREATE USER mercado WITH PASSWORD '$SenhaApp';" 2>&1
    Write-Log "Resultado: $($out -join ' ')"
    if ($LASTEXITCODE -ne 0) {
        Write-Log "AVISO: Falha ao criar usuario, tentando ALTER..." "WARN"
        $out2 = & $psql -U postgres -d postgres -c "ALTER USER mercado WITH PASSWORD '$SenhaApp';" 2>&1
        Write-Log "Resultado ALTER: $($out2 -join ' ')"
    }
} else {
    Write-Log "Usuario 'mercado' ja existe. Atualizando senha..."
    $out = & $psql -U postgres -d postgres -c "ALTER USER mercado WITH PASSWORD '$SenhaApp';" 2>&1
    Write-Log "Resultado: $($out -join ' ')"
}
$env:PGPASSWORD = ""

# --- Criar banco 'mercadopro_db' ---
Write-Log "Verificando banco 'mercadopro_db'..."
$env:PGPASSWORD = $senhaPg
$checkDb = (& $psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM pg_database WHERE datname='mercadopro_db';" 2>&1) -join ""
$env:PGPASSWORD = ""
Write-Log "Resultado verificacao banco: '$checkDb'"

$env:PGPASSWORD = $senhaPg
if ($checkDb.Trim() -eq "0" -or $checkDb.Trim() -eq "") {
    Write-Log "Criando banco 'mercadopro_db'..."
    $out = & $psql -U postgres -d postgres -c "CREATE DATABASE mercadopro_db OWNER mercado;" 2>&1
    Write-Log "Resultado: $($out -join ' ')"
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO ao criar banco: $($out -join ' ')" "ERROR"
        $env:PGPASSWORD = ""
        exit 1
    }
} else {
    Write-Log "Banco 'mercadopro_db' ja existe."
    # Garantir que o owner e correto
    $out = & $psql -U postgres -d postgres -c "ALTER DATABASE mercadopro_db OWNER TO mercado;" 2>&1
    Write-Log "Owner atualizado: $($out -join ' ')"
}
$env:PGPASSWORD = ""

# --- Conceder permissoes no schema public ao usuario 'mercado' ---
Write-Log "Concedendo permissoes no schema public ao usuario 'mercado'..."
$env:PGPASSWORD = $senhaPg
$grantSqls = @(
    "GRANT USAGE ON SCHEMA public TO mercado;"
    "GRANT CREATE ON SCHEMA public TO mercado;"
    "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mercado;"
    "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mercado;"
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mercado;"
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mercado;"
)
foreach ($sql in $grantSqls) {
    $out = & $psql -U postgres -d mercadopro_db -c $sql 2>&1
    Write-Log "GRANT: $sql -> $($out -join ' ')"
}
$env:PGPASSWORD = ""

# --- Salvar resultados no registro ---
# Tenta HKLM (instalador roda como admin), fallback para HKCU
$regPath = "HKLM:\Software\MercadoPro\Setup"
try {
    New-Item -Path $regPath -Force -ErrorAction Stop | Out-Null
} catch {
    $regPath = "HKCU:\Software\MercadoPro\Setup"
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "SenhaApp" -Value $SenhaApp  -Force
Set-ItemProperty -Path $regPath -Name "PgBinDir" -Value $PgBinDir  -Force
Set-ItemProperty -Path $regPath -Name "PgSenha"  -Value $senhaPg   -Force

Write-Log "Configuracao concluida com sucesso!"
Write-Log "Usuario: mercado | Banco: mercadopro_db | PgBin: $PgBinDir"
exit 0
