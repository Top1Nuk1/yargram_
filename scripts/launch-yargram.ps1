[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
# Адрес, по которому друзья открывают Yargram, задаётся переменной окружения
# RADMIN_IP (прежнее имя оставлено, чтобы уже созданные ярлыки не сломались).
# Когда появится публичное имя (домен или адрес туннеля), сюда можно положить
# его: лаунчер сам соберёт ссылки для печати.
function Get-ActiveIpAddresses {
    try {
        return @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object { $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up } |
            ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
            Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
            ForEach-Object { $_.Address.IPAddressToString })
    }
    catch {
        return @("127.0.0.1")
    }
}

$allActiveIps = Get-ActiveIpAddresses
$radminIp = if (-not [string]::IsNullOrWhiteSpace($env:RADMIN_IP) -and ($allActiveIps -contains $env:RADMIN_IP)) {
    $env:RADMIN_IP
} elseif ($allActiveIps -contains "26.53.76.128") {
    "26.53.76.128"
} else {
    ($allActiveIps | Where-Object { $_ -like "26.*" } | Select-Object -First 1)
}

$lanIp = ($allActiveIps | Where-Object {
    $_ -like "192.168.*" -or $_ -like "10.*" -or ($_ -match "^172\.(1[6-9]|2[0-9]|3[0-1])\.")
} | Select-Object -First 1)
if (-not $lanIp) { $lanIp = "127.0.0.1" }

$primaryIp = if ($radminIp) { $radminIp } else { $lanIp }

$httpPort = if ([string]::IsNullOrWhiteSpace($env:PORT)) { 3000 } else { $env:PORT }
$httpsPort = if ([string]::IsNullOrWhiteSpace($env:HTTPS_PORT)) { 3443 } else { $env:HTTPS_PORT }
$httpUrl = "http://${primaryIp}:${httpPort}"
$httpsUrl = "https://${primaryIp}:${httpsPort}"

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

    Write-Host "[1/4] Останавливаем прежнюю версию и открываем доступ другу..." -ForegroundColor Cyan
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
        # Без правил Windows Firewall друг не подключится, но локально Yargram
        # работает. Поэтому не обрываем запуск, а громко предупреждаем.
        Write-Host ""
        Write-Host "ВНИМАНИЕ: шаг с правами администратора завершился с кодом $($accessProcess.ExitCode)." -ForegroundColor Yellow
        Write-Host "Если выше нет строки о добавленном правиле — правил Windows Firewall нет," -ForegroundColor Yellow
        Write-Host "и друг не сможет подключиться. Yargram всё равно попробует запуститься." -ForegroundColor Yellow
        Write-Host ""
    }

    Write-Host "[2/4] Запускаем новую сборку в отдельном окне..." -ForegroundColor Cyan
    $startScript = Join-Path $PSScriptRoot "start-yargram.ps1"
    $serverArguments = "-NoLogo -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $serverArguments `
        -WorkingDirectory $projectRoot | Out-Null

    Write-Host "[3/4] Ждём готовности сервера..." -ForegroundColor Cyan
    # HTTP обязателен: именно по нему заходит друг. HTTPS необязателен — он
    # нужен только для звонков и может не подняться, если нет сертификата.
    $httpReady = $false
    $httpsReady = $false
    $probeUrls = @("http://127.0.0.1:${httpPort}", "http://localhost:${httpPort}", $httpUrl) | Select-Object -Unique
    for ($attempt = 0; $attempt -lt 240; $attempt++) {
        if (-not $httpReady) {
            foreach ($probe in $probeUrls) {
                try {
                    $httpHealth = Invoke-RestMethod -Uri "$probe/api/health" -TimeoutSec 2
                    if ($httpHealth.status -eq "ok" -and $httpHealth.service -eq "yargram-server") {
                        $httpReady = $true
                        break
                    }
                }
                catch { }
            }
        }

        if ($httpReady -and -not $httpsReady) {
            try {
                $httpsHealth = Invoke-RestMethod -Uri "$httpsUrl/api/health" -TimeoutSec 2
                if ($httpsHealth.status -eq "ok" -and $httpsHealth.service -eq "yargram-server") {
                    $page = Invoke-WebRequest -UseBasicParsing -Uri "$httpsUrl/" -TimeoutSec 3
                    $csp = [string]$page.Headers["Content-Security-Policy"]
                    if ($page.StatusCode -eq 200 -and $csp -notmatch "upgrade-insecure-requests") {
                        $httpsReady = $true
                    }
                }
            }
            catch {
                # HTTPS is optional: calls only.
            }
        }

        if ($httpReady -and ($httpsReady -or $attempt -ge 40)) {
            break
        }

        Start-Sleep -Milliseconds 500
    }

    if (-not $httpReady) {
        throw "Сервер не отвечает по адресу $httpUrl. Посмотрите ошибку в отдельном окне 'Yargram Server'."
    }

    Write-Host "[4/4] Ставим резервную копию в очередь..." -ForegroundColor Cyan
    # Копия делается в фоне и запуск не задерживает: сервер к этому моменту уже
    # отвечает, значит и PostgreSQL поднята. Скрипт сам решает, нужна ли копия
    # сегодня (делает не чаще раза в сутки) и удаляет копии старше недели.
    # Отдельным процессом, а не через "&": вывод длинный, а ждать его нельзя —
    # друг ждёт ссылку. Окно прячем, итог уходит в runtime\backups\backup.log.
    try {
        $backupScript = Join-Path $PSScriptRoot "backup.mjs"
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodeExe = if ($null -ne $nodeCommand) { $nodeCommand.Source } else { "node" }
        # 🔥 Без -RedirectStandardOutput. В Windows PowerShell 5.1 он падает с
        # «Элемент уже добавлен. Ключ в словаре: "Path"», если в окружении есть и
        # Path, и PATH — тогда процесс вообще не стартует, а файлы журнала
        # остаются пустыми. Поэтому журнал ведёт сам скрипт, а --quiet означает
        # «на экран ничего, только в runtime\backups\backup.log».
        Start-Process `
            -FilePath $nodeExe `
            -ArgumentList @("`"$backupScript`"", "--quiet") `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden | Out-Null
        Write-Host "      Копия делается в фоне — Yargram её не ждёт." -ForegroundColor DarkGray
        Write-Host "      Если сегодняшняя копия уже есть, шаг пропустится." -ForegroundColor DarkGray
        Write-Host "      Итог: runtime\backups\backup.log" -ForegroundColor DarkGray
    }
    catch {
        # Копия не должна мешать запуску: без неё Yargram работает.
        Write-Host "      Копию поставить в очередь не удалось: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "      Yargram это не мешает. Сделайте копию вручную: «Сделать копию Yargram.bat»." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "             Yargram успешно запущен!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  🌐 В интернете (РФ без VPN и без запреток):" -ForegroundColor White
    Write-Host "     https://top1nuk1.alwaysdata.net" -ForegroundColor Cyan
    Write-Host "     (Приложение: https://top1nuk1.alwaysdata.net/app)" -ForegroundColor DarkCyan
    if ($lanIp -ne "127.0.0.1") {
        Write-Host "  🏠 Домашняя сеть Wi-Fi (телефон / ноутбук без VPN):" -ForegroundColor White
        Write-Host "     http://${lanIp}:${httpPort}" -ForegroundColor Green
    }
    Write-Host "  💻 На этом компьютере:" -ForegroundColor White
    Write-Host "     http://localhost:${httpPort}" -ForegroundColor Gray
    if ($radminIp) {
        Write-Host "  🔒 Radmin VPN:" -ForegroundColor White
        Write-Host "     http://${radminIp}:${httpPort}" -ForegroundColor Yellow
        if ($httpsReady) {
            Write-Host "     (HTTPS: https://${radminIp}:${httpsPort})" -ForegroundColor Yellow
        }
    }
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Не закрывайте окно сервера, пока вы или друзья пользуетесь Yargram." -ForegroundColor Magenta
    Start-Process "http://localhost:${httpPort}"
    Wait-ForEnter
}
catch {
    Write-Host ""
    Write-Host "Не удалось запустить Yargram:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Wait-ForEnter
    exit 1
}
