# Cloudflare Tunnel do Ayran: liga ayran-origin.vztecnologia.com.br -> Central (127.0.0.1:3000).
# O publico acessa vztecnologia.com.br/ayran; um Worker do Cloudflare repassa pra ayran-origin.
# Credenciais ficam em ~/.cloudflared (cert.pem + <id>.json) — nunca versionar.

$ErrorActionPreference = 'Stop'

$AyranHome = if ($env:AYRAN_HOME) { $env:AYRAN_HOME } else { Join-Path $env:USERPROFILE 'ayran-server' }
$LogDir = Join-Path $AyranHome 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

$TunnelName = 'ayran'
$Hostname = 'ayran-origin.vztecnologia.com.br'
$cfDir = Join-Path $env:USERPROFILE '.cloudflared'
$creds = Get-ChildItem $cfDir -Filter '*.json' | Select-Object -First 1
if (-not $creds) { throw "Credenciais do tunel nao encontradas em $cfDir (rode: cloudflared tunnel create $TunnelName)" }

# Gerado a cada inicio pra nao depender de caminho fixo de usuario.
$config = Join-Path $AyranHome 'cloudflared.yml'
@"
tunnel: $TunnelName
credentials-file: $($creds.FullName)
ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:3000
  - service: http_status:404
"@ | Set-Content -Encoding ascii $config

$exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $exe) { $exe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
$log = Join-Path $LogDir 'tunnel.log'

# Vigia: o Agendador nao reinicia processo que cai depois de iniciado, entao o loop faz isso.
while ($true) {
    cmd /c "`"$exe`" tunnel --no-autoupdate --config `"$config`" run $TunnelName >> `"$log`" 2>&1"
    Add-Content $log "$(Get-Date -Format s) [vigia] Tunel saiu (codigo $LASTEXITCODE), reiniciando em 5s"
    Start-Sleep 5
}
