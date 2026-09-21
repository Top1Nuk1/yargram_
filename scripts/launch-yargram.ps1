[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$radminIp = $env:RADMIN_IP
if ($null -eq $radminIp) {
    $radminIp = "26.236.251.44"
}
$httpUrl = "http://${radminIp}:3000"
$httpsUrl = "https://${radminIp}:3443"

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Wait-ForEnter {
    param([string]$Message = "Нажмите Enter, чтобы закрыть это окно")
    if ([Environment]::UserInteractive) {
        Read-Host $Message | Out-Null
    }
}

# Окно сервера обязано работать без повышения: встроенная PostgreSQL
# (embedded-postgres) отказывается стартовать под административным токеном —
# "Execution of PostgreSQL by a user with administrative permissions is not
# permitted". Права нужны только файрволу и остановке прежнего экземпляра,
# поэтому повышение запрашивается точечно, отдельным процессом.
if (Test-IsAdministrator) {
    Write-Host ""
    Write-Host "Yargram нельзя запускать от имени администратора." -ForegroundColor Red
    Write-Host "Встроенная PostgreSQL отказывается стартовать с повышенными правами." -ForegroundColor Yellow
    Write-Host "Закройте окно и запустите «Запустить Yargram.bat» обычным двойным" -ForegroundColor Yellow
    Write-Host "кликом — лаунчер сам спросит права, когда они понадобятся." -ForegroundColor Yellow
    Wait-ForEnter
    exit 1
}

try {
    Set-Location -LiteralPath $projectRoot
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor DarkCyan
    Write-Host "             Yargram — запуск" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor DarkCyan

    Write-Host "[1/3] Останавливаем прежнюю версию и открываем доступ другу..." -ForegroundColor Cyan
    $accessScript = Join-Path $PSScriptRoot "prepare-yargram-access.ps1"
    $accessArguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$accessScript`""
    $accessProcess = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $accessArguments `
        -WorkingDirectory $projectRoot `
        -Verb RunAs `
        -Wait `
        -PassThru
    $accessLog = Join-Path $projectRoot "runtime/launch-access.log"
    if (Test-Path -LiteralPath $accessLog -PathType Leaf) {
        foreach ($line in @(Get-Content -LiteralPath $accessLog)) {
            if ($line) { Write-Host "      $line" }
        }
    }
    if ($accessProcess.ExitCode -ne 0) {
        throw "Не удалось подготовить доступ (код $($accessProcess.ExitCode)). Откройте scripts\open-firewall.ps1 от имени администратора и посмотрите ошибку."
    }

    Write-Host "[2/3] Запускаем новую сборку в отдельном окне..." -ForegroundColor Cyan
    $startScript = Join-Path $PSScriptRoot "start-yargram.ps1"
    $serverArguments = "-NoLogo -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $serverArguments `
        -WorkingDirectory $projectRoot | Out-Null

    Write-Host "[3/3] Ждём готовности HTTP и защищённого HTTPS..." -ForegroundColor Cyan
    $ready = $false
    for ($attempt = 0; $attempt -lt 240; $attempt++) {
        try {
            $httpHealth = Invoke-RestMethod -Uri "$httpUrl/api/health" -TimeoutSec 2
            $httpsHealth = Invoke-RestMethod -Uri "$httpsUrl/api/health" -TimeoutSec 2
            if ($httpHealth.status -eq "ok" -and
                $httpsHealth.status -eq "ok" -and
                $httpsHealth.service -eq "yargram-server") {
                $page = Invoke-WebRequest -UseBasicParsing -Uri "$httpsUrl/" -TimeoutSec 3
                $csp = [string]$page.Headers["Content-Security-Policy"]
                if ($page.StatusCode -eq 200 -and $csp -notmatch "upgrade-insecure-requests") {
                    $ready = $true
                    break
                }
            }
        }
        catch {
            # Server installation and the first build can take a little while.
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $ready) {
        throw "Сервер не стал доступен по HTTPS. Посмотрите ошибку в отдельном окне 'Yargram Server'."
    }

    Write-Host ""
    Write-Host "Yargram запущен успешно." -ForegroundColor Green
    Write-Host "Ваша ссылка:  $httpsUrl" -ForegroundColor Yellow
    Write-Host "Ссылка другу: $httpsUrl" -ForegroundColor Yellow

    Write-Host ""
    Write-Host "Не закрывайте окно сервера, пока друг пользуется Yargram." -ForegroundColor Magenta
    Start-Process $httpsUrl
    Wait-ForEnter
}
catch {
    Write-Host ""
    Write-Host "Не удалось запустить Yargram:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Wait-ForEnter
    exit 1
}
