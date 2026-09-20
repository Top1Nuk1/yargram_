[CmdletBinding()]
param(
    [int]$Port = 3000,
    [int]$HttpsPort = 3443,
    [switch]$Quiet
)

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ports = @($Port, $HttpsPort)
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) {
    if (-not $Quiet) {
        Write-Host "Yargram уже остановлен: порты $Port и $HttpsPort свободны." -ForegroundColor Green
    }
    return
}

$health = $null
$verifiedPort = $Port
try {
    if (@($listeners | Where-Object { $_.LocalPort -eq $Port }).Count -gt 0) {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    }
    else {
        $verifiedPort = $HttpsPort
        $health = Invoke-RestMethod -Uri "https://127.0.0.1:$HttpsPort/api/health" -TimeoutSec 3
    }
}
catch {
    throw "Порты Yargram заняты, но процесс не подтвердил, что он является сервером Yargram. Чужой процесс не остановлен."
}

if ($health.service -ne "yargram-server") {
    throw "Один из портов занят другим приложением. Чужой процесс не остановлен."
}

$processIds = @(
    $listeners |
        Where-Object { $_.LocalPort -eq $verifiedPort } |
        Select-Object -ExpandProperty OwningProcess -Unique
)
foreach ($processId in $processIds) {
    Stop-Process -Id $processId -Force -ErrorAction Stop
}

for ($attempt = 0; $attempt -lt 24; $attempt++) {
    $remainingYargramListeners = @(
        Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue |
            Where-Object { $processIds -contains $_.OwningProcess }
    )
    if ($remainingYargramListeners.Count -eq 0) {
        if (-not $Quiet) {
            Write-Host "Yargram остановлен." -ForegroundColor Green
        }
        return
    }
    Start-Sleep -Milliseconds 250
}

throw "Процесс Yargram получил команду остановки, но его сетевой порт всё ещё занят."
