# Instala a voz local do Ayran: Whisper (ouvir) e vozes Piper (falar). Rode uma vez.
$home_ = Join-Path $env:USERPROFILE 'ayran-server'
$py = Join-Path $home_ 'hub-venv\Scripts\python.exe'
& $py -m pip install piper-tts faster-whisper
New-Item -ItemType Directory -Force (Join-Path $home_ 'data\voices') | Out-Null
foreach ($v in 'pt_BR-faber-medium', 'pt_BR-cadu-medium', 'pt_BR-jeff-medium') {
  & $py -m piper.download_voices $v --download-dir (Join-Path $home_ 'data\voices')
}
# o modelo Whisper ("small") baixa sozinho na primeira transcricao
Write-Host 'Pronto. Reinicie a Central para carregar os endpoints /api/voice.'
