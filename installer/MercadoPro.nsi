; =============================================================
; MercadoPro ERP - Script de Instalacao NSIS
; Uso: makensis /DVERSION=1.0.0 MercadoPro.nsi
; =============================================================

Unicode True

!ifndef VERSION
  !define VERSION "1.0.0"
!endif

Name                "MercadoPro ERP ${VERSION}"
OutFile             "MercadoPro_Setup_v${VERSION}.exe"
InstallDir          "$PROGRAMFILES64\MercadoPro"
InstallDirRegKey    HKLM "Software\MercadoPro" "InstallDir"
RequestExecutionLevel admin
BrandingText        "MercadoPro ERP v${VERSION}"
SetCompressor       /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; --- Aparencia MUI ---
!define MUI_ABORTWARNING
!define MUI_ICON                     "assets\logo.ico"
!define MUI_UNICON                   "assets\logo.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "assets\welcome.bmp"
!define MUI_WELCOMEPAGE_TITLE        "Bem-vindo ao MercadoPro ERP"
!define MUI_WELCOMEPAGE_TEXT         "Este assistente instalara o MercadoPro ERP ${VERSION}.$\r$\n$\r$\nGerencie seu mercadinho com PDV, estoque, clientes e relatorios.$\r$\n$\r$\nClique em Proximo para continuar."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT      "Abrir MercadoPro ERP agora"
!define MUI_FINISHPAGE_RUN_FUNCTION  "AbrirSistema"

; --- Variaveis globais ---
Var NomeEmpresa
Var TipoInstalacao
Var ArquivoBackup
Var SenhaApp
Var PgBinDir
Var Dialog
Var InputEmpresa
Var RadioNovo
Var RadioRestore
Var InputBackup
Var BtnBrowse

; --- Paginas ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE     "assets\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
Page custom PaginaEmpresa         PaginaEmpresaLeave
Page custom PaginaTipoInstalacao  PaginaTipoInstalacaoLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; =============================================================
; PAGINA: Nome da Empresa
; =============================================================
Function PaginaEmpresa
  !insertmacro MUI_HEADER_TEXT "Nome da Empresa" "Informe o nome do seu estabelecimento."
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 10u 100% 20u "Nome do estabelecimento:"
  Pop $0
  ${NSD_CreateText} 0 35u 100% 14u "Mercadinho Local"
  Pop $InputEmpresa
  nsDialogs::Show
FunctionEnd

Function PaginaEmpresaLeave
  ${NSD_GetText} $InputEmpresa $NomeEmpresa
  ${If} $NomeEmpresa == ""
    StrCpy $NomeEmpresa "Mercadinho Local"
  ${EndIf}
FunctionEnd

; =============================================================
; PAGINA: Tipo de Instalacao
; =============================================================
Function PaginaTipoInstalacao
  !insertmacro MUI_HEADER_TEXT "Tipo de Instalacao" "Escolha como deseja iniciar."
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${NSD_CreateRadioButton} 0 10u 100% 14u "Instalacao nova (sistema vazio)"
  Pop $RadioNovo
  ${NSD_Check} $RadioNovo
  ${NSD_CreateRadioButton} 0 30u 100% 14u "Restaurar backup existente"
  Pop $RadioRestore
  ${NSD_CreateLabel} 0 52u 100% 12u "Arquivo de backup (.backup):"
  Pop $0
  ${NSD_CreateText} 0 67u 78% 14u ""
  Pop $InputBackup
  ${NSD_CreateButton} 80% 66u 20% 16u "Procurar..."
  Pop $BtnBrowse
  ${NSD_OnClick} $BtnBrowse ProcurarBackup
  nsDialogs::Show
FunctionEnd

Function ProcurarBackup
  nsDialogs::SelectFileDialog open "" "Arquivos Backup (*.backup)|*.backup"
  Pop $ArquivoBackup
  ${If} $ArquivoBackup != ""
    ${NSD_SetText} $InputBackup $ArquivoBackup
    ${NSD_Check} $RadioRestore
    ${NSD_Uncheck} $RadioNovo
  ${EndIf}
FunctionEnd

Function PaginaTipoInstalacaoLeave
  ${NSD_GetState} $RadioNovo $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $TipoInstalacao "novo"
  ${Else}
    StrCpy $TipoInstalacao "restaurar"
    ${NSD_GetText} $InputBackup $ArquivoBackup
    ${If} $ArquivoBackup == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Selecione um arquivo .backup para restaurar."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

; =============================================================
; SECAO PRINCIPAL
; =============================================================
Section "MercadoPro ERP" SecPrincipal
  SectionIn RO

  ; --- 0. Parar servico e processos anteriores se existirem ---
  DetailPrint "Parando servicos e processos anteriores..."
  ${If} ${FileExists} "$INSTDIR\Tools\nssm.exe"
    nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" stop MercadoProService'
  ${EndIf}
  nsExec::ExecToLog 'cmd.exe /c taskkill /F /IM node.exe'
  Sleep 2000

  ; --- 1. Extrair arquivos ---
  DetailPrint "Extraindo Runtime Node.js..."
  SetOutPath "$INSTDIR\Runtime\node"
  File /r "staging\Runtime\node\*.*"

  DetailPrint "Extraindo Backend..."
  SetOutPath "$INSTDIR\Backend"
  File /r "staging\Backend\*.*"

  DetailPrint "Extraindo Frontend..."
  SetOutPath "$INSTDIR\Backend\public"
  File /r "staging\Frontend\*.*"

  DetailPrint "Extraindo ferramentas..."
  SetOutPath "$INSTDIR\Tools"
  File "staging\Tools\nssm.exe"
  File "setup-db.ps1"

  CreateDirectory "$INSTDIR\Backup"
  CreateDirectory "$INSTDIR\Logs"
  CreateDirectory "$INSTDIR\Backend\config"

  ; --- 2. Verificar PostgreSQL ---
  DetailPrint "Verificando PostgreSQL..."
  Call VerificarPostgreSQL

  ${If} $PgBinDir == ""
    DetailPrint "Instalando PostgreSQL (aguarde, pode demorar alguns minutos)..."
    Call InstalarPostgreSQL
  ${Else}
    DetailPrint "PostgreSQL encontrado em: $PgBinDir"
  ${EndIf}

  ; --- 3. Configurar banco via PowerShell ---
  ; Script externo evita problemas de aspas e lida com autenticacao
  DetailPrint "Configurando banco de dados..."
  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -File "$INSTDIR\Tools\setup-db.ps1" -InstDir "$INSTDIR" -PgBinDir "$PgBinDir"'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONSTOP "Falha na configuracao do banco.$\r$\nLog: $INSTDIR\Logs\setup-db.log"
    Abort
  ${EndIf}

  ; Recuperar senha gerada pelo script (tenta HKLM, depois HKCU)
  ReadRegStr $SenhaApp HKLM "Software\MercadoPro\Setup" "SenhaApp"
  ${If} $SenhaApp == ""
    ReadRegStr $SenhaApp HKCU "Software\MercadoPro\Setup" "SenhaApp"
  ${EndIf}
  ReadRegStr $PgBinDir HKLM "Software\MercadoPro\Setup" "PgBinDir"
  ${If} $PgBinDir == ""
    ReadRegStr $PgBinDir HKCU "Software\MercadoPro\Setup" "PgBinDir"
  ${EndIf}

  ; --- 4. Gerar config.json ---
  DetailPrint "Gerando configuracao..."
  Call GerarConfigJson
  Call GerarDotEnv

  ; --- 5. Migracoes Prisma ---
  DetailPrint "Aplicando migracoes do banco..."
  nsExec::ExecToLog '"$INSTDIR\Runtime\node\node.exe" "$INSTDIR\Backend\node_modules\.bin\prisma" migrate deploy'

  ; --- 6. Seed inicial ---
  DetailPrint "Inserindo dados iniciais..."
  nsExec::ExecToLog '"$INSTDIR\Runtime\node\node.exe" "$INSTDIR\Backend\dist\prisma\seed.js"'

  ; --- 7. Restaurar backup (opcional) ---
  ${If} $TipoInstalacao == "restaurar"
    DetailPrint "Restaurando backup..."
    nsExec::ExecToLog '"$INSTDIR\Runtime\node\node.exe" "$INSTDIR\Backend\dist\utils\restoreHelper.js" "$ArquivoBackup"'
  ${EndIf}

  ; --- 8. Instalar servico Windows ---
  DetailPrint "Instalando servico Windows..."
  Call InstalarServico

  ; --- 9. Iniciar servico ---
  DetailPrint "Iniciando MercadoPro..."
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" start MercadoProService'

  ; --- 10. Atalhos e registro ---
  Call CriarAtalhos
  Call RegistrarDesinstalador

  DetailPrint "Instalacao concluida!"
SectionEnd

; =============================================================
; FUNCOES AUXILIARES
; =============================================================

Function VerificarPostgreSQL
  StrCpy $PgBinDir ""

  ${If} ${FileExists} "$PROGRAMFILES64\PostgreSQL\17\bin\psql.exe"
    StrCpy $PgBinDir "$PROGRAMFILES64\PostgreSQL\17\bin"
  ${ElseIf} ${FileExists} "$PROGRAMFILES64\PostgreSQL\16\bin\psql.exe"
    StrCpy $PgBinDir "$PROGRAMFILES64\PostgreSQL\16\bin"
  ${ElseIf} ${FileExists} "$PROGRAMFILES64\PostgreSQL\15\bin\psql.exe"
    StrCpy $PgBinDir "$PROGRAMFILES64\PostgreSQL\15\bin"
  ${ElseIf} ${FileExists} "$PROGRAMFILES64\PostgreSQL\14\bin\psql.exe"
    StrCpy $PgBinDir "$PROGRAMFILES64\PostgreSQL\14\bin"
  ${EndIf}
FunctionEnd

Function InstalarPostgreSQL
  SetOutPath "$TEMP\MercadoProPG"
  File "staging\pg-installer\postgresql-installer.exe"

  nsExec::ExecToLog '"$TEMP\MercadoProPG\postgresql-installer.exe" --mode unattended --superpassword "MpSetup2024!" --serverport 5432 --prefix "$PROGRAMFILES64\PostgreSQL\16" --datadir "$PROGRAMFILES64\PostgreSQL\16\data" --enable-components server --disable-components pgAdmin,stackbuilder'

  Sleep 8000
  StrCpy $PgBinDir "$PROGRAMFILES64\PostgreSQL\16\bin"

  ; Registrar senha do superusuario para o setup-db.ps1
  WriteRegStr HKLM "Software\MercadoPro\Setup" "PgSuperPass" "MpSetup2024!"

  RMDir /r "$TEMP\MercadoProPG"
FunctionEnd

Function GerarConfigJson
  FileOpen $0 "$INSTDIR\Backend\config\config.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 "  $\"empresa$\": $\"$NomeEmpresa$\",$\r$\n"
  FileWrite $0 "  $\"api$\": { $\"host$\": $\"localhost$\", $\"porta$\": 3001 },$\r$\n"
  FileWrite $0 "  $\"database$\": {$\r$\n"
  FileWrite $0 "    $\"host$\": $\"localhost$\",$\r$\n"
  FileWrite $0 "    $\"porta$\": 5432,$\r$\n"
  FileWrite $0 "    $\"nome$\": $\"mercadopro_db$\",$\r$\n"
  FileWrite $0 "    $\"usuario$\": $\"mercado$\",$\r$\n"
  FileWrite $0 "    $\"senha$\": $\"$SenhaApp$\"$\r$\n"
  FileWrite $0 "  },$\r$\n"
  FileWrite $0 "  $\"backup$\": {$\r$\n"
  FileWrite $0 "    $\"diretorio$\": $\"$INSTDIR\\Backup$\",$\r$\n"
  FileWrite $0 "    $\"hora$\": $\"22:00$\",$\r$\n"
  FileWrite $0 "    $\"maximo$\": 30$\r$\n"
  FileWrite $0 "  },$\r$\n"
  FileWrite $0 "  $\"impressora$\": { $\"cupom$\": $\"$\", $\"etiquetas$\": $\"$\" },$\r$\n"
  FileWrite $0 "  $\"sistema$\": {$\r$\n"
  FileWrite $0 "    $\"primeiroAcesso$\": true,$\r$\n"
  FileWrite $0 "    $\"versao$\": $\"${VERSION}$\",$\r$\n"
  FileWrite $0 "    $\"logDir$\": $\"$INSTDIR\\Logs$\"$\r$\n"
  FileWrite $0 "  }$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0
FunctionEnd

Function GerarDotEnv
  FileOpen $0 "$INSTDIR\Backend\.env" w
  FileWrite $0 "DATABASE_URL=$\"postgresql://mercado:$SenhaApp@localhost:5432/mercadopro_db$\"$\r$\n"
  FileWrite $0 "JWT_SECRET=$\"mercadopro_jwt_${VERSION}_local$\"$\r$\n"
  FileWrite $0 "JWT_EXPIRES_IN=$\"8h$\"$\r$\n"
  FileWrite $0 "PORT=3001$\r$\n"
  FileWrite $0 "NODE_ENV=production$\r$\n"
  FileWrite $0 "CONFIG_PATH=$\"$INSTDIR\Backend\config\config.json$\"$\r$\n"
  FileClose $0
FunctionEnd

Function InstalarServico
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" stop MercadoProService'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" remove MercadoProService confirm'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" install MercadoProService "$INSTDIR\Runtime\node\node.exe"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppDirectory "$INSTDIR\Backend"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppParameters "dist\server.js"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService DisplayName "MercadoPro ERP"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService Start SERVICE_AUTO_START'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppEnvironmentExtra "NODE_ENV=production" "CONFIG_PATH=$INSTDIR\Backend\config\config.json"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppStdout "$INSTDIR\Logs\service.log"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppStderr "$INSTDIR\Logs\service-error.log"'
  nsExec::ExecToLog '"$INSTDIR\Tools\nssm.exe" set MercadoProService AppRestartDelay 5000'
FunctionEnd

Function CriarAtalhos
  CreateShortcut "$DESKTOP\MercadoPro ERP.lnk" "$SYSDIR\rundll32.exe" "url.dll,FileProtocolHandler http://localhost:3001" "$INSTDIR\Tools\nssm.exe" 0
  CreateDirectory "$SMPROGRAMS\MercadoPro"
  CreateShortcut "$SMPROGRAMS\MercadoPro\MercadoPro ERP.lnk" "$SYSDIR\rundll32.exe" "url.dll,FileProtocolHandler http://localhost:3001"
  CreateShortcut "$SMPROGRAMS\MercadoPro\Desinstalar MercadoPro.lnk" "$INSTDIR\Uninstall.exe"
FunctionEnd

Function RegistrarDesinstalador
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "DisplayName"     "MercadoPro ERP"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "Publisher"       "MercadoPro"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "NoModify"        1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro" "NoRepair"        1
  WriteRegStr   HKLM "Software\MercadoPro" "InstallDir" "$INSTDIR"
  WriteRegStr   HKLM "Software\MercadoPro" "Version"    "${VERSION}"
FunctionEnd

Function AbrirSistema
  ExecShell "open" "http://localhost:3001"
FunctionEnd

; =============================================================
; DESINSTALACAO
; =============================================================
Section "Uninstall"
  ExecWait '"$INSTDIR\Tools\nssm.exe" stop MercadoProService'
  ExecWait '"$INSTDIR\Tools\nssm.exe" remove MercadoProService confirm'

  MessageBox MB_YESNO|MB_ICONQUESTION "Manter os backups e dados?" IDYES ManteDados IDNO RemoveDados
  RemoveDados:
    RMDir /r "$INSTDIR\Backup"
  ManteDados:

  Delete "$DESKTOP\MercadoPro ERP.lnk"
  RMDir /r "$SMPROGRAMS\MercadoPro"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MercadoPro"
  DeleteRegKey HKLM "Software\MercadoPro"

  RMDir /r "$INSTDIR\Runtime"
  RMDir /r "$INSTDIR\Backend"
  RMDir /r "$INSTDIR\Tools"
  RMDir /r "$INSTDIR\Logs"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  MessageBox MB_OK "MercadoPro desinstalado. O banco PostgreSQL foi preservado."
SectionEnd
