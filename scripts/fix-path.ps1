# Adiciona Node.js ao PATH do sistema
$nodePath = "C:\Program Files\nodejs"
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")

if ($currentPath -notlike "*nodejs*") {
    [System.Environment]::SetEnvironmentVariable("Path", $currentPath + ";" + $nodePath, "Machine")
    Write-Host "OK: Node.js adicionado ao PATH do sistema." -ForegroundColor Green
} else {
    Write-Host "Node.js ja estava no PATH." -ForegroundColor Yellow
}

# Atualiza o PATH da sessão atual também
$env:Path = $env:Path + ";" + $nodePath

# Confirma
Write-Host "Testando node..." -ForegroundColor Cyan
& "$nodePath\node.exe" --version
Write-Host "Testando npm..." -ForegroundColor Cyan
& "$nodePath\npm.cmd" --version
Write-Host ""
Write-Host "Pronto! Feche este terminal e abra um novo para usar npm normalmente." -ForegroundColor Green
