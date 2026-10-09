# Liga uma LoRA adulta no gerador de imagem e reinicia a Central.
# Uso:
#   .\server\set-image-lora.ps1 minha_lora.safetensors
#   .\server\set-image-lora.ps1 minha_lora.safetensors -Model 0.9 -Clip 0.7
#   .\server\set-image-lora.ps1 ""            # desliga a LoRA (volta ao DreamShaper puro)
# A LoRA precisa estar em: C:\Users\Gabriel\ayran-server\comfyui-models\loras\

param(
    [string]$Lora = "",
    [double]$Model = 0.8,
    [double]$Clip = 0.8
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE 'ayran-server\image-lora.env'
$loraDir = Join-Path $env:USERPROFILE 'ayran-server\comfyui-models\loras'

if ($Lora) {
    $full = Join-Path $loraDir $Lora
    if (-not (Test-Path $full)) {
        Write-Host "AVISO: '$Lora' nao encontrada em $loraDir" -ForegroundColor Yellow
        Write-Host "Coloque o .safetensors la antes de gerar, senao o ComfyUI recusa." -ForegroundColor Yellow
    }
    $lines = @(
        "AYRAN_IMAGE_LORA=$Lora",
        "AYRAN_IMAGE_LORA_MODEL=$Model",
        "AYRAN_IMAGE_LORA_CLIP=$Clip"
    )
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
    Write-Host "LoRA ativada: $Lora (model=$Model clip=$Clip)" -ForegroundColor Green
} else {
    Remove-Item $envFile -ErrorAction SilentlyContinue
    Write-Host "LoRA desligada (DreamShaper puro)." -ForegroundColor Green
}

$pid3000 = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1).OwningProcess
if ($pid3000) {
    Stop-Process -Id $pid3000 -Force
    Write-Host "Central reiniciando (PID $pid3000 derrubado, vigia religa em ~5s)..." -ForegroundColor Cyan
} else {
    Write-Host "Nada escutando na porta 3000 - a Central pode estar parada." -ForegroundColor Yellow
}

