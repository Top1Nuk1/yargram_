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
$failed = $false

function Add-YargramAccessMessage {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
    if (-not [string]::IsNullOrWhiteSpace($Text)) {
        $script:messages.Add($Text.Trim())
    }
}

function Invoke-YargramAccessStep {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$ScriptPath
    )

    Add-YargramAccessMessage -Text "--- $Title ---"
    try {
        # *>&1 забирает и ошибки, и предупреждения: иначе причина сбоя
        # теряется вместе с закрытием повышенного окна.
        $output = & $ScriptPath *>&1
        foreach ($line in @($output)) {
            Add-YargramAccessMessage -Text ([string]$line)
        }
    }
    catch {
        $script:failed = $true
        Add-YargramAccessMessage -Text "ОШИБКА: $($_.Exception.Message)"
        $invocation = $_.InvocationInfo
        if ($null -ne $invocation -and -not [string]::IsNullOrWhiteSpace($invocation.ScriptName)) {
            Add-YargramAccessMessage -Text "Место: $($invocation.ScriptName):$($invocation.ScriptLineNumber)"
        }
    }
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
Add-YargramAccessMessage -Text "Пользователь: $($identity.Name), права администратора: $isAdministrator"

try {
    Invoke-YargramAccessStep -Title "Остановка прежней версии" -ScriptPath (Join-Path $PSScriptRoot "stop-yargram.ps1")
    Invoke-YargramAccessStep -Title "Правила Windows Firewall" -ScriptPath (Join-Path $PSScriptRoot "open-firewall.ps1")
}
finally {
    # Отчёт нужен родителю: своё окно повышенного процесса закрывается сразу.
    [System.IO.File]::WriteAllLines($logPath, $messages, [System.Text.Encoding]::UTF8)
}

if ($failed) {
    exit 1
}
