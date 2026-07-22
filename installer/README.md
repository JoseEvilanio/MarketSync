# MercadoPro ERP — Instalador Setup.exe

## Como gerar o instalador

### Pré-requisitos (máquina de desenvolvimento)

1. **NSIS 3.x** → https://nsis.sourceforge.io/Download
   - Instale e certifique-se que `makensis.exe` está no PATH
2. **Node.js** (para buildar o projeto)
3. **Acesso à internet** na primeira execução (baixa Node portátil, NSSM e PostgreSQL)

### Gerar o Setup.exe

```powershell
cd mercadinho\scripts
.\build-installer.ps1
```

O arquivo será gerado em `installer\MercadoPro_Setup_v1.1.0.exe`.

### Opções do script

```powershell
# Especificar versão manualmente
.\build-installer.ps1 -Versao "1.2.0"

# Pular builds (usar dist/ existente)
.\build-installer.ps1 -SkipBuilds true

# Pular downloads (usar cache existente)
.\build-installer.ps1 -SkipDownloads true
```

---

## Estrutura da pasta installer/

```
installer/
├── MercadoPro.nsi          ← Script NSIS principal (versionado)
├── README.md               ← Este arquivo
├── assets/
│   ├── LICENSE.txt         ← Termos de uso (exibido no instalador)
│   ├── logo.ico            ← Ícone do instalador (adicionar manualmente)
│   └── welcome.bmp         ← Imagem lateral 164×314px (adicionar manualmente)
├── cache/                  ← Downloads automáticos (gitignored)
│   ├── node-v22-win-x64.zip
│   ├── nssm-2.24.zip
│   └── postgresql-installer.exe
└── staging/                ← Montado pelo build-installer.ps1 (gitignored)
```

---

## Assets visuais

Para personalizar a aparência do instalador, adicione:

| Arquivo | Tamanho | Formato |
|---------|---------|---------|
| `assets/logo.ico` | 256×256 px | ICO (multi-resolução) |
| `assets/welcome.bmp` | 164×314 px | BMP 24-bit |

Sem esses arquivos, o NSIS usa ícone e imagem padrão.

---

## O que o instalador faz

1. Exibe assistente gráfico com 7 telas
2. Extrai Node.js v22 portátil (sem alterar PATH do sistema)
3. Instala PostgreSQL 16 silenciosamente (ou usa instalação existente)
4. Cria usuário `mercado` e banco `mercadopro_db` com senha aleatória
5. Extrai e configura o backend compilado
6. Aplica migrações Prisma (`prisma migrate deploy`)
7. Popula dados iniciais (seed)
8. Registra o backend como serviço Windows (`MercadoProService`)
9. Cria atalhos na Área de Trabalho e Menu Iniciar
10. Registra o desinstalador no Painel de Controle

---

## Serviço Windows

Após a instalação, o backend roda como serviço:

```
Nome:    MercadoProService
Início:  Automático (inicia com o Windows)
Porta:   http://localhost:3001
```

Para gerenciar manualmente:
```powershell
# Parar
nssm stop MercadoProService

# Iniciar
nssm start MercadoProService

# Ver status
sc query MercadoProService
```
