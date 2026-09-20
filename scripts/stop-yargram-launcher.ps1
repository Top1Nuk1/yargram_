[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    try {
        Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $projectRoot -Verb RunAs | Out-Null
    }
    catch {
        Write-Host "Запрос UAC был отменён. Yargram продолжает работать." -ForegroundColor Red
        Read-Host "Нажмите Enter" | Out-Null
        exit 1
    }
    return
}

try {
    & (Join-Path $PSScriptRoot "stop-yargram.ps1")
    Write-Host "Теперь друг временно не сможет открыть Yargram." -ForegroundColor Yellow
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Чужие процессы не были затронуты." -ForegroundColor Yellow
}

Read-Host "Нажмите Enter, чтобы закрыть окно" | Out-Null
