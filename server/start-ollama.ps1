# Inicia o servidor Ollama do Ayran com a configuracao do servidor (sem o app de bandeja).

$ErrorActionPreference = 'Stop'

$AyranHome = if ($env:AYRAN_HOME) { $env:AYRAN_HOME } else { Join-Path $env:USERPROFILE 'ayran-server' }
$LogDir = Join-Path $AyranHome 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

# Nunca expor o Ollama: ele nao tem autenticacao. Quem fala com ele e o Open WebUI, local.
$env:OLLAMA_HOST = '127.0.0.1:11434'
# 32 GB de RAM: o modelo de codigo (~22 GB) + um pequeno (embeddings/chat) no maximo.
$env:OLLAMA_MAX_LOADED_MODELS = '2'
$env:OLLAMA_NUM_PARALLEL = '1'
# Libera a memoria quando o modelo fica parado.
$env:OLLAMA_KEEP_ALIVE = '10m'
$env:OLLAMA_FLASH_ATTENTION = '1'
$env:OLLAMA_KV_CACHE_TYPE = 'q8_0'

$exe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $exe) { $exe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
$log = Join-Path $LogDir 'ollama.log'

# Vigia: o Agendador nao reinicia processo que cai depois de iniciado, entao o loop faz isso.
while ($true) {
    # Runners (llama-server) que sobraram de um Ollama anterior seguram o modelo inteiro na RAM.
    Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
        Where-Object { -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }

    # Via cmd: no PowerShell 5.1 o stderr de executavel nativo vira erro e derruba o script.
    cmd /c "`"$exe`" serve >> `"$log`" 2>&1"
    Add-Content $log "$(Get-Date -Format s) [vigia] Ollama saiu (codigo $LASTEXITCODE), reiniciando em 5s"
    Start-Sleep 5
}
