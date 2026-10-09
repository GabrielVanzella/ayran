# Inicia a Central do Ayran (hub/backend + frontend compilado) na porta 3000.

$ErrorActionPreference = 'Stop'

$AyranHome = if ($env:AYRAN_HOME) { $env:AYRAN_HOME } else { Join-Path $env:USERPROFILE 'ayran-server' }
$LogDir = Join-Path $AyranHome 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

$backend = Join-Path (Split-Path -Parent $PSScriptRoot) 'hub\backend'
$py = Join-Path $AyranHome 'hub-venv\Scripts\python.exe'
$BindHost = if ($env:AYRAN_HUB_BIND) { $env:AYRAN_HUB_BIND } else { '127.0.0.1' }
$Port = if ($env:AYRAN_HUB_PORT) { $env:AYRAN_HUB_PORT } else { '3000' }

# Config opcional da imagem (LoRA adulta) — ver server/set-image-lora.ps1
$envFile = Join-Path $AyranHome 'image-lora.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            Set-Item -Path ("env:" + $matches[1]) -Value $matches[2]
        }
    }
}

Set-Location $backend
# Via cmd: no PowerShell 5.1 o stderr de executavel nativo vira erro e derruba o script.
$log = Join-Path $LogDir 'hub.log'
# Vigia: o Agendador nao reinicia processo que cai depois de iniciado, entao o loop faz isso.
while ($true) {
    cmd /c "`"$py`" -m uvicorn main:app --host $BindHost --port $Port --proxy-headers >> `"$log`" 2>&1"
    Add-Content $log "$(Get-Date -Format s) [vigia] Central saiu (codigo $LASTEXITCODE), reiniciando em 5s"
    Start-Sleep 5
}
