# Registra tarefas agendadas que sobem o Ollama e o Open WebUI no logon do usuario,
# reiniciando automaticamente se cairem. Rodar de novo atualiza as tarefas.

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$user = "$env:USERDOMAIN\$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable -MultipleInstances IgnoreNew

$tasks = @(
    @{ Name = 'Ayran - Ollama'; Script = 'start-ollama.ps1'; Delay = 'PT10S' },
    @{ Name = 'Ayran - Open WebUI'; Script = 'start-webui.ps1'; Delay = 'PT40S' },
    @{ Name = 'Ayran - Central'; Script = 'start-hub.ps1'; Delay = 'PT50S' },
    @{ Name = 'Ayran - ComfyUI'; Script = 'start-comfyui.ps1'; Delay = 'PT60S' },
    @{ Name = 'Ayran - Tunel'; Script = 'start-tunnel.ps1'; Delay = 'PT70S' }
)

foreach ($t in $tasks) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $here $t.Script)`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $trigger.Delay = $t.Delay
    # Vigia do vigia: a cada 5 min o Windows tenta iniciar a tarefa. Com MultipleInstances=IgnoreNew,
    # se ela ja esta rodando nada acontece; se foi encerrada por qualquer motivo, sobe de novo.
    $watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger @($trigger, $watchdog) -Settings $settings `
        -Principal $principal -Force | Out-Null
    "Tarefa registrada: $($t.Name)"
}
