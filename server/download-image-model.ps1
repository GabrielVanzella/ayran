# Baixa um modelo/LoRA de imagem a partir de uma URL direta (.safetensors) e
# instala na pasta certa do ComfyUI. Depois disso, ligue a LoRA com
# server/set-image-lora.ps1 (ou troque o CHECKPOINT no media.py se for checkpoint).
#
# Uso:
#   .\server\download-image-model.ps1 -Url "https://civitai.com/api/download/models/12345?type=Model&format=SafeTensor" -Kind lora
#   .\server\download-image-model.ps1 -Url "<url direta do .safetensors>" -Kind checkpoint -Name "meu_modelo.safetensors"
#
# -Kind lora       -> salva em comfyui-models\loras\
# -Kind checkpoint -> salva em comfyui-models\checkpoints\
#
# Civitai: a pagina do modelo tem um botao de download; a URL costuma ser
# https://civitai.com/api/download/models/<ID>?type=Model&format=SafeTensor
# (as vezes pede ?token=... para modelos restritos).

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][ValidateSet('lora', 'checkpoint')][string]$Kind,
    [string]$Name = ''
)

$ErrorActionPreference = 'Stop'
$modelsRoot = Join-Path $env:USERPROFILE 'ayran-server\comfyui-models'
$destDir = Join-Path $modelsRoot $Kind
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

if (-not $Name) {
    # tenta deduzir o nome do arquivo da URL
    $leaf = ([System.Uri]$Url).Segments | Select-Object -Last 1
    if ($leaf -match '=') { $leaf = 'modelo.safetensors' }
    if (-not $leaf.EndsWith('.safetensors')) { $leaf = 'modelo.safetensors' }
    $Name = $leaf
}

$dest = Join-Path $destDir $Name
$part = "$dest.part"

Write-Host "Baixando:" -ForegroundColor Cyan
Write-Host "  de     : $Url"
Write-Host "  para   : $dest"
Write-Host "Isso pode levar alguns minutos (modelos tem dezenas/centenas de MB)..." -ForegroundColor DarkGray

# Baixa para .part e renomeia no fim (evita arquivo corrompido se cair no meio)
Invoke-WebRequest -Uri $Url -OutFile $part -UseBasicParsing -MaximumRedirection 5
Move-Item -Path $part -Destination $dest -Force

$sizeGB = [math]::Round((Get-Item $dest).Length / 1GB, 2)
Write-Host "OK: salvo ($sizeGB GB) em $dest" -ForegroundColor Green

if ($Kind -eq 'lora') {
    Write-Host ""
    Write-Host "Proximo passo: ligue a LoRA e reinicie a Central:" -ForegroundColor Yellow
    Write-Host "  .\server\set-image-lora.ps1 `"$Name`"" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "Proximo passo: aponte o CHECKPOINT no hub/backend/media.py para `"$Name`" e reinicie a Central." -ForegroundColor Yellow
    Write-Host "  (mate o PID da porta 3000; o vigia religa. Ou me peca pra trocar.)" -ForegroundColor White
}
