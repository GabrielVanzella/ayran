# Inicia o ComfyUI (motor de imagem/video do Ayran) so na maquina local, porta 8188.
# Modelos ficam em $AyranHome\comfyui-models (fora do repo e fora da pasta do ComfyUI, pra atualizar sem perder nada).

$ErrorActionPreference = 'Stop'

$AyranHome = if ($env:AYRAN_HOME) { $env:AYRAN_HOME } else { Join-Path $env:USERPROFILE 'ayran-server' }
$LogDir = Join-Path $AyranHome 'logs'
$Models = Join-Path $AyranHome 'comfyui-models'
$Comfy = Join-Path $AyranHome 'comfyui'
New-Item -ItemType Directory -Force $LogDir, (Join-Path $Models 'checkpoints') | Out-Null

$paths = Join-Path $AyranHome 'comfyui-extra-paths.yaml'
@"
ayran:
    base_path: $Models
    checkpoints: checkpoints
    vae: vae
    loras: loras
    upscale_models: upscale_models
    diffusion_models: diffusion_models
    text_encoders: text_encoders
    clip_vision: clip_vision
"@ | Set-Content -Encoding utf8 $paths

$py = Join-Path $AyranHome 'comfy-venv\Scripts\python.exe'
# 4 GB de VRAM: --lowvram divide o modelo entre GPU e RAM. No PC novo (24 GB) trocar por --normalvram ou --highvram.
$vramMode = if ($env:AYRAN_COMFY_VRAM) { $env:AYRAN_COMFY_VRAM } else { '--lowvram' }
$log = Join-Path $LogDir 'comfyui.log'

Set-Location $Comfy
# Vigia: o Agendador nao reinicia processo que cai depois de iniciado, entao o loop faz isso.
while ($true) {
    cmd /c "`"$py`" main.py --listen 127.0.0.1 --port 8188 $vramMode --disable-auto-launch --extra-model-paths-config `"$paths`" >> `"$log`" 2>&1"
    Add-Content $log "$(Get-Date -Format s) [vigia] ComfyUI saiu (codigo $LASTEXITCODE), reiniciando em 5s"
    Start-Sleep 5
}
