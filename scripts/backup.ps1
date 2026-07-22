# ============================================================
# MarketSync ERP - Backup Manual
# ============================================================
$backendDir = Join-Path (Split-Path $PSScriptRoot -Parent) "backend"
Write-Host "Iniciando backup via API..." -ForegroundColor Yellow

# Ler token do localStorage não é possível via script, usar endpoint direto com credenciais
$body = @{ email = "admin@mercadinho.local"; senha = "admin123" } | ConvertTo-Json
try {
    $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $body -ContentType "application/json"
    $token = $login.token
    
    $headers = @{ Authorization = "Bearer $token" }
    $result = Invoke-RestMethod -Uri "http://localhost:3001/api/backup/executar" -Method Post -Headers $headers
    
    Write-Host "Backup realizado: $($result.arquivo)" -ForegroundColor Green
} catch {
    Write-Host "Erro ao realizar backup: $_" -ForegroundColor Red
    Write-Host "Certifique-se de que o servidor esta rodando." -ForegroundColor Yellow
}
