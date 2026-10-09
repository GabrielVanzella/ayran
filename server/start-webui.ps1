# Inicia o Open WebUI do Ayran (home/chat + contas + API).
# Dados (usuarios, chats, chaves, base de conhecimento) ficam fora do repo, em $AyranHome\data.
# Segredos ficam em $AyranHome\secret.key (nunca versionar).

$ErrorActionPreference = 'Stop'

$AyranHome = if ($env:AYRAN_HOME) { $env:AYRAN_HOME } else { Join-Path $env:USERPROFILE 'ayran-server' }
$DataDir   = Join-Path $AyranHome 'data'
$SecretFile = Join-Path $AyranHome 'secret.key'
$LogDir    = Join-Path $AyranHome 'logs'
New-Item -ItemType Directory -Force $DataDir, $LogDir | Out-Null

if (-not (Test-Path $SecretFile)) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    [Convert]::ToBase64String($bytes) | Set-Content -Encoding ascii $SecretFile
}

$env:WEBUI_NAME         = 'Ayran'
$env:WEBUI_SECRET_KEY   = (Get-Content $SecretFile -Raw).Trim()
$env:DATA_DIR           = $DataDir
$env:OLLAMA_BASE_URL    = 'http://127.0.0.1:11434'
$env:ENABLE_OPENAI_API  = 'false'
# Primeiro cadastro vira admin; os seguintes ficam pendentes ate aprovacao.
$env:DEFAULT_USER_ROLE  = 'pending'
$env:ENABLE_API_KEYS    = 'true'
$env:RAG_EMBEDDING_ENGINE = 'ollama'
$env:RAG_EMBEDDING_MODEL  = 'bge-m3'
$env:DEFAULT_LOCALE     = 'pt-BR'
$env:SCARF_NO_ANALYTICS = 'true'
$env:DO_NOT_TRACK       = 'true'
$env:ANONYMIZED_TELEMETRY = 'false'

# 127.0.0.1 = so esta maquina. Acesso remoto entra via tunel (Cloudflare/Tailscale), nao por porta aberta.
$BindHost = if ($env:AYRAN_BIND) { $env:AYRAN_BIND } else { '127.0.0.1' }
$Port     = if ($env:AYRAN_PORT) { $env:AYRAN_PORT } else { '8080' }

$exe = Join-Path $AyranHome 'venv\Scripts\open-webui.exe'
# Via cmd: no PowerShell 5.1 o stderr de executavel nativo vira erro e derruba o script.
$log = Join-Path $LogDir 'webui.log'
cmd /c "`"$exe`" serve --host $BindHost --port $Port >> `"$log`" 2>&1"
