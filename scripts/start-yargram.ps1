[CmdletBinding()]
param(
    [switch]$ForceInstall,
    [switch]$ForceBuild
)

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "Yargram Server" } catch { }

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ExpectedIp = "26.53.76.128"
if (-not [string]::IsNullOrWhiteSpace($env:RADMIN_IP)) { $ExpectedIp = $env:RADMIN_IP }
$ExpectedPort = 3000
$ExpectedHttpsPort = 3443
$EnvironmentFile = Join-Path $ProjectRoot ".env"

function Invoke-Npm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    & $script:NpmCommand @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "npm завершился с кодом $LASTEXITCODE."
    }
}

function Test-LocalIpAddress {
    param([Parameter(Mandatory = $true)][string]$IpAddress)

    try {
        $addresses = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object { $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up } |
            ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
            ForEach-Object { $_.Address.IPAddressToString }

        return $addresses -contains $IpAddress
    }
    catch {
        Write-Warning "Не удалось получить адреса сетевых адаптеров: $($_.Exception.Message)"
        return $false
    }
}

function New-JwtSecret {
    $bytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }

    return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

function Import-DotEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            continue
        }

        $name = $Matches[1]
        $value = $Matches[2]
        if ($value.Length -ge 2) {
            $firstCharacter = $value.Substring(0, 1)
            $lastCharacter = $value.Substring($value.Length - 1, 1)
            if (($firstCharacter -eq '"' -and $lastCharacter -eq '"') -or
                ($firstCharacter -eq "'" -and $lastCharacter -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Get-NewestWriteTimeUtc {
    param([Parameter(Mandatory = $true)][string[]]$Paths)

    $items = foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Get-Item -LiteralPath $path
        }
        elseif (Test-Path -LiteralPath $path -PathType Container) {
            Get-ChildItem -LiteralPath $path -File -Recurse
        }
    }

    $newest = $items | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -eq $newest) {
        return [DateTime]::MinValue
    }

    return $newest.LastWriteTimeUtc
}

function Test-BuildRequired {
    $serverOutput = Join-Path $ProjectRoot "apps/server/dist/index.js"
    $webOutput = Join-Path $ProjectRoot "apps/web/dist/index.html"
    if (-not (Test-Path -LiteralPath $serverOutput -PathType Leaf) -or
        -not (Test-Path -LiteralPath $webOutput -PathType Leaf)) {
        return $true
    }

    $inputs = @(
        (Join-Path $ProjectRoot "apps/server/src"),
        (Join-Path $ProjectRoot "apps/server/package.json"),
        (Join-Path $ProjectRoot "apps/server/tsconfig.json"),
        (Join-Path $ProjectRoot "apps/web/src"),
        (Join-Path $ProjectRoot "apps/web/package.json"),
        (Join-Path $ProjectRoot "apps/web/index.html"),
        (Join-Path $ProjectRoot "apps/web/vite.config.ts"),
        (Join-Path $ProjectRoot "apps/web/tsconfig.json"),
        (Join-Path $ProjectRoot "apps/web/tsconfig.app.json"),
        (Join-Path $ProjectRoot "apps/web/tsconfig.node.json")
    )
    $newestInput = Get-NewestWriteTimeUtc -Paths $inputs
    $oldestOutput = @(
        (Get-Item -LiteralPath $serverOutput).LastWriteTimeUtc,
        (Get-Item -LiteralPath $webOutput).LastWriteTimeUtc
    ) | Sort-Object | Select-Object -First 1

    return $newestInput -gt $oldestOutput
}

Write-Host "Yargram: проверка окружения..." -ForegroundColor Cyan

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $node) {
    throw "Node.js не найден. Установите Node.js 20 или новее и повторите запуск."
}

$nodeVersionText = (& $node.Source --version).Trim().TrimStart("v")
$nodeVersion = $null
if (-not [System.Version]::TryParse($nodeVersionText, [ref]$nodeVersion) -or $nodeVersion.Major -lt 20) {
    throw "Нужен Node.js 20 или новее. Сейчас найден: $nodeVersionText."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npm) {
    throw "npm.cmd не найден рядом с Node.js. Переустановите Node.js с npm."
}
$script:NpmCommand = $npm.Source

if (-not (Test-LocalIpAddress -IpAddress $ExpectedIp)) {
    throw "IP $ExpectedIp не найден среди активных адаптеров. Запустите Radmin VPN и подключитесь к нужной сети Yargram."
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
    $jwtSecret = New-JwtSecret
    $environmentLines = @(
        "NODE_ENV=production",
        "HOST=0.0.0.0",
        "PORT=$ExpectedPort",
        "JWT_SECRET=$jwtSecret",
        "JWT_EXPIRES_IN=7d",
        "BCRYPT_ROUNDS=10",
        "CORS_ORIGINS=http://${ExpectedIp}:3000,https://${ExpectedIp}:${ExpectedHttpsPort},http://localhost:3000,https://localhost:${ExpectedHttpsPort},http://127.0.0.1:3000,https://127.0.0.1:${ExpectedHttpsPort},http://${ExpectedIp}:5173,http://localhost:5173,http://127.0.0.1:5173"
    )
    Set-Content -LiteralPath $EnvironmentFile -Value $environmentLines -Encoding UTF8
    Write-Host "Создан .env с новым случайным JWT-секретом." -ForegroundColor Green
}

Import-DotEnvFile -Path $EnvironmentFile

# The optional local database has a separate lifetime; never silently use JSON on failure.
if ($env:DATABASE_DRIVER -eq "postgres" -or -not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    Write-Host "Хранилище: PostgreSQL. Локальная база запускается автоматически." -ForegroundColor Cyan
}

# These values are fixed for the temporary production endpoint.
$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
$env:PORT = "$ExpectedPort"

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET) -or $env:JWT_SECRET.Length -lt 16) {
    throw "В .env переменная JWT_SECRET должна содержать не менее 16 символов."
}

$nodeModules = Join-Path $ProjectRoot "node_modules"
$lockFile = Join-Path $ProjectRoot "package-lock.json"
if ($ForceInstall -or -not (Test-Path -LiteralPath $nodeModules -PathType Container) -or
    -not (Test-Path -LiteralPath $lockFile -PathType Leaf)) {
    Write-Host "Установка зависимостей workspace..." -ForegroundColor Cyan
    Invoke-Npm install --workspaces --include-workspace-root
}

# Прежняя версия держит порты и продолжает отвечать на /api/health. Если её не
# погасить, новая сборка не займёт порт, а лаунчер увидит ответ старого сервера
# и решит, что всё готово — приложение останется на прежнем коде, и новые
# маршруты будут отвечать 404. Заодно освобождаем apps/web/dist: сборка его чистит.
Write-Host "Останавливаем прежнюю версию..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "stop-yargram.ps1")

if ($ForceBuild -or (Test-BuildRequired)) {
    Write-Host "Сборка web и server..." -ForegroundColor Cyan
    Invoke-Npm run build
}

& node (Join-Path $PSScriptRoot "ensure-postgres.mjs")
if ($LASTEXITCODE -ne 0) {
    $launcherLog = Join-Path $ProjectRoot "runtime/postgres/launcher.log"
    $hint = "Не удалось запустить PostgreSQL (код $LASTEXITCODE). Смотрите $launcherLog."
    if ((Test-Path -LiteralPath $launcherLog -PathType Leaf) -and
        ((Get-Content -LiteralPath $launcherLog -Raw) -match "administrative permissions")) {
        $hint = "PostgreSQL отказалась стартовать: это окно запущено с правами администратора. " +
                "Закройте его и запустите «Запустить Yargram.bat» обычным двойным кликом — " +
                "лаунчер сам запросит права только для файрвола, а сервер и база пойдут без повышения."
    }
    throw $hint
}

Write-Host "Подготовка HTTPS для звонков (необязательный шаг)..." -ForegroundColor Cyan
# Запускаем отдельным процессом: если подготовка сертификата завершится
# ошибкой или вызовом exit, сервер всё равно должен подняться по HTTP.
$httpsScript = Join-Path $PSScriptRoot "setup-https.ps1"
$httpsArguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$httpsScript`""
$httpsProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $httpsArguments `
    -WorkingDirectory $ProjectRoot `
    -NoNewWindow `
    -Wait `
    -PassThru
if ($httpsProcess.ExitCode -ne 0) {
    Write-Warning "HTTPS-сертификат подготовить не удалось (код $($httpsProcess.ExitCode)). Yargram продолжит работу по HTTP."
}

# setup-https.ps1 creates or refreshes TLS values after the web build, which
# also guarantees that the public certificate archive is restored in dist.
Import-DotEnvFile -Path $EnvironmentFile
$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
$env:PORT = "$ExpectedPort"
$env:CORS_ORIGINS = "http://${ExpectedIp}:3000,https://${ExpectedIp}:${ExpectedHttpsPort},http://localhost:3000,https://localhost:${ExpectedHttpsPort},http://127.0.0.1:3000,https://127.0.0.1:${ExpectedHttpsPort},http://${ExpectedIp}:5173,http://localhost:5173,http://127.0.0.1:5173"

# HTTPS нужен только для звонков. Если сертификат не готов, Yargram работает
# по HTTP: переписка, файлы и фотографии доступны, звонки — нет.
$httpsReady = $false
if (-not [string]::IsNullOrWhiteSpace($env:TLS_PFX_PATH) -and
    -not [string]::IsNullOrWhiteSpace($env:TLS_PFX_PASSWORD) -and
    (Test-Path -LiteralPath $env:TLS_PFX_PATH -PathType Leaf)) {
    # Повреждённый PFX или несовпадающий пароль уронили бы весь сервер целиком,
    # вместе с HTTP. Поэтому сначала убеждаемся, что файл действительно открывается.
    try {
        $null = New-Object -TypeName System.Security.Cryptography.X509Certificates.X509Certificate2 `
            -ArgumentList $env:TLS_PFX_PATH, $env:TLS_PFX_PASSWORD
        $httpsReady = $true
    }
    catch {
        Write-Warning "HTTPS-сертификат не читается: $($_.Exception.Message)"
    }
}
if ($httpsReady) {
    $env:HTTPS_PORT = "$ExpectedHttpsPort"
}
else {
    Remove-Item Env:HTTPS_PORT -ErrorAction SilentlyContinue
    Write-Warning "Yargram запустится без HTTPS. Другу доступна ссылка http://${ExpectedIp}:$ExpectedPort, звонки работать не будут."
}

$portsToCheck = @($ExpectedPort)
if ($httpsReady) {
    $portsToCheck += $ExpectedHttpsPort
}
foreach ($portToCheck in $portsToCheck) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $portToCheck -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $listener) {
        throw "Порт $portToCheck уже занят процессом PID $($listener.OwningProcess). Остановите его и повторите запуск."
    }
}

$firewallRules = @(
    Get-NetFirewallRule -Name "YarGram-Temporary-TCP-3000", "Yargram-Temporary-TCP-3443" -ErrorAction SilentlyContinue
)
if ($firewallRules.Count -lt 2 -or @($firewallRules | Where-Object { $_.Enabled -ne "True" }).Count -gt 0) {
    Write-Warning "Правила Windows Firewall для Yargram не найдены. Для доступа друга запустите лаунчер с подтверждением UAC."
}

Write-Host "Yargram доступен в сети Radmin VPN:" -ForegroundColor Green
Write-Host "  HTTP (друг):    http://${ExpectedIp}:$ExpectedPort" -ForegroundColor Green
if ($httpsReady) {
    Write-Host "  HTTPS (звонки): https://${ExpectedIp}:$ExpectedHttpsPort" -ForegroundColor Green
}
else {
    Write-Host "  HTTPS (звонки): недоступен — сертификат не подготовлен" -ForegroundColor DarkGray
}
Write-Host "Для остановки нажмите Ctrl+C." -ForegroundColor DarkGray
Invoke-Npm run start --workspace "@yargram/server"
