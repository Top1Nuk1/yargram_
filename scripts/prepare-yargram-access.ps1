[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Единственный шаг запуска, которому нужны права администратора:
# остановить прежний экземпляр Yargram (он мог быть запущен повышенным, и тогда
# снять его обычным процессом нельзя) и открыть порты другу через Radmin VPN.
#
# Сервер отсюда запускать нельзя ни в коем случае: встроенная PostgreSQL
# отказывается стартовать под повышенным токеном.

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$logPath = Join-Path $projectRoot "runtime/launch-access.log"

Set-Location -LiteralPath $projectRoot

$messages = New-Object System.Collections.Generic.List[string]
try {
    $stopOutput = & (Join-Path $PSScriptRoot "stop-yargram.ps1") -Quiet 2>&1
    if ($stopOutput) { $messages.AddRange([string[]]$stopOutput) }

    $firewallOutput = & (Join-Path $PSScriptRoot "open-firewall.ps1") 2>&1
    if ($firewallOutput) { $messages.AddRange([string[]]$firewallOutput) }
}
finally {
    # Отчёт нужен родителю: своё окно повышенного процесса закрывается сразу.
    [System.IO.File]::WriteAllLines($logPath, $messages, [System.Text.Encoding]::UTF8)
}
