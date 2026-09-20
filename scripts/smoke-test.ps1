[CmdletBinding()]
param(
    [string]$TargetHost = "26.236.251.44",
    [int]$Port = 3000
)

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$smokeRoot = Join-Path $projectRoot (".smoke-" + [guid]::NewGuid().ToString("N"))
$resolvedSmokeRoot = [System.IO.Path]::GetFullPath($smokeRoot)
if (-not $resolvedSmokeRoot.StartsWith(
    $projectRoot + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "Небезопасный путь временной папки: $resolvedSmokeRoot"
}

$serverEntry = Join-Path $projectRoot "apps/server/dist/index.js"
$webEntry = Join-Path $projectRoot "apps/web/dist/index.html"
if (-not (Test-Path -LiteralPath $serverEntry -PathType Leaf) -or
    -not (Test-Path -LiteralPath $webEntry -PathType Leaf)) {
    throw "Сначала выполните npm.cmd run build."
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Порт $Port уже занят. Smoke-test запускает собственный временный сервер."
}

New-Item -ItemType Directory -Path $resolvedSmokeRoot | Out-Null
$stdoutPath = Join-Path $resolvedSmokeRoot "server.stdout.log"
$stderrPath = Join-Path $resolvedSmokeRoot "server.stderr.log"
$serverProcess = $null
$baseUrl = "http://${TargetHost}:$Port"

try {
    $env:NODE_ENV = "production"
    $env:HOST = "0.0.0.0"
    $env:PORT = "$Port"
    # Keep dotenv from enabling the persistent HTTPS listener during this
    # isolated HTTP smoke test.
    $env:HTTPS_PORT = "0"
    $env:TLS_PFX_PATH = "disabled-for-smoke-test"
    $env:TLS_PFX_PASSWORD = "disabled-for-smoke-test"
    $env:JWT_SECRET = "yargram-smoke-test-secret-2026-only"
    $env:JWT_EXPIRES_IN = "1h"
    $env:BCRYPT_ROUNDS = "4"
    $env:DATABASE_DRIVER = "json"
    $env:DATA_DIR = Join-Path $resolvedSmokeRoot "data"
    $env:CORS_ORIGINS = "$baseUrl,http://localhost:$Port,http://127.0.0.1:$Port"

    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $serverProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList $serverEntry `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $health = $null
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($serverProcess.HasExited) {
            throw "Сервер завершился с кодом $($serverProcess.ExitCode)."
        }
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2
            break
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if ($null -eq $health -or $health.status -ne "ok") {
        throw "Health endpoint не ответил по адресу $baseUrl."
    }

    $suffix = [guid]::NewGuid().ToString("N").Substring(0, 10)
    $password = "SmokePass2026"
    $aliceBody = @{
        email = "alice.$suffix@example.test"
        password = $password
        displayName = "Алиса"
        username = "alice_$suffix"
    } | ConvertTo-Json
    $bobBody = @{
        email = "bob.$suffix@example.test"
        password = $password
        displayName = "Борис"
        username = "bob_$suffix"
    } | ConvertTo-Json

    $alice = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/auth/register" `
        -ContentType "application/json; charset=utf-8" `
        -Body $aliceBody
    $bob = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/auth/register" `
        -ContentType "application/json; charset=utf-8" `
        -Body $bobBody
    $headers = @{ Authorization = "Bearer $($alice.accessToken)" }

    $users = Invoke-RestMethod -Uri "$baseUrl/api/users?q=bob_$suffix" -Headers $headers
    if ($users.users.Count -ne 1 -or $users.users[0].id -ne $bob.user.id) {
        throw "Проверка поиска пользователя завершилась ошибкой."
    }

    $conversation = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/conversations/direct" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body (@{ userId = $bob.user.id } | ConvertTo-Json)
    $sent = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/api/conversations/$($conversation.conversation.id)/messages" `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body (@{ text = "Привет из сетевого smoke-теста" } | ConvertTo-Json)
    $history = Invoke-RestMethod `
        -Uri "$baseUrl/api/conversations/$($conversation.conversation.id)/messages" `
        -Headers $headers
    if ($history.messages.Count -ne 1 -or $history.messages[0].id -ne $sent.message.id) {
        throw "Проверка истории сообщений завершилась ошибкой."
    }

    $page = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/" -TimeoutSec 5
    if ($page.StatusCode -ne 200 -or $page.Content -notmatch '<div id="root"></div>') {
        throw "Production web-клиент не был отдан сервером."
    }
    $contentSecurityPolicy = [string]$page.Headers["Content-Security-Policy"]
    if ($contentSecurityPolicy -match "upgrade-insecure-requests") {
        throw "CSP принудительно переводит ресурсы на HTTPS и вызовет белый экран на временном HTTP-адресе."
    }

    [pscustomobject]@{
        TargetUrl = $baseUrl
        Health = $health.status
        WebStatus = $page.StatusCode
        RegisteredUsers = 2
        ConversationCreated = [bool]$conversation.created
        MessagesStored = $history.messages.Count
    }
}
catch {
    if (Test-Path -LiteralPath $stdoutPath) {
        Write-Host "--- server stdout ---"
        Get-Content -LiteralPath $stdoutPath
    }
    if (Test-Path -LiteralPath $stderrPath) {
        Write-Host "--- server stderr ---"
        Get-Content -LiteralPath $stderrPath
    }
    throw
}
finally {
    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        $serverProcess.WaitForExit()
    }
    if (Test-Path -LiteralPath $resolvedSmokeRoot) {
        $verifiedPath = [System.IO.Path]::GetFullPath($resolvedSmokeRoot)
        if ($verifiedPath.StartsWith(
            $projectRoot + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            Remove-Item -LiteralPath $verifiedPath -Recurse -Force
        }
    }
}
