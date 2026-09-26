[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedIp = "26.53.76.128"
if ($env:RADMIN_IP) {
    $expectedIp = $env:RADMIN_IP
}
$httpPort = 3000
$httpsPort = 3443
$httpUrl = "http://${expectedIp}:$httpPort"
$httpsUrl = "https://${expectedIp}:$httpsPort"
$problems = New-Object System.Collections.Generic.List[string]

Write-Host ""
Write-Host "Проверка Yargram" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan

$ipAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $expectedIp } |
    Select-Object -First 1
if ($null -eq $ipAddress) {
    Write-Host "[ОШИБКА] Radmin VPN IP $expectedIp не найден." -ForegroundColor Red
    $problems.Add("Запустите Radmin VPN и подключитесь к нужной сети.")
}
else {
    Write-Host "[OK] Radmin VPN: $($ipAddress.InterfaceAlias), IP $expectedIp" -ForegroundColor Green
}

foreach ($port in @($httpPort, $httpsPort)) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $listener) {
        if ($port -eq $httpsPort) {
            Write-Host "[НЕОБЯЗАТЕЛЬНО] На порту $port нет сервера — звонки будут недоступны." -ForegroundColor Yellow
        }
        else {
            Write-Host "[ОШИБКА] На порту $port нет сервера." -ForegroundColor Red
            $problems.Add("Запустите файл 'Запустить Yargram.bat'.")
        }
    }
    else {
        Write-Host "[OK] Сервер слушает $($listener.LocalAddress):$port (PID $($listener.OwningProcess))." -ForegroundColor Green
    }
}

foreach ($endpoint in @($httpUrl, $httpsUrl)) {
    try {
        $health = Invoke-RestMethod -Uri "$endpoint/api/health" -TimeoutSec 4
        if ($health.status -ne "ok" -or $health.service -ne "yargram-server") {
            throw "Неожиданный ответ API"
        }
        Write-Host "[OK] API отвечает: $endpoint" -ForegroundColor Green
    }
    catch {
        if ($endpoint -eq $httpsUrl) {
            Write-Host "[НЕОБЯЗАТЕЛЬНО] HTTPS не отвечает: $endpoint — звонки будут недоступны." -ForegroundColor Yellow
        }
        else {
            Write-Host "[ОШИБКА] API не отвечает: $endpoint" -ForegroundColor Red
            $problems.Add("Запустите файл 'Запустить Yargram.bat'.")
        }
    }
}



$requiredRules = @(
    @{ Name = "YarGram-Temporary-TCP-3000"; Port = 3000 },
    @{ Name = "Yargram-Temporary-TCP-3443"; Port = 3443 }
)
foreach ($requiredRule in $requiredRules) {
    $firewallRule = Get-NetFirewallRule -Name $requiredRule.Name -ErrorAction SilentlyContinue
    if ($null -eq $firewallRule -or $firewallRule.Enabled -ne "True") {
        Write-Host "[ОШИБКА] Нет правила Windows Firewall для TCP $($requiredRule.Port)." -ForegroundColor Red
        $problems.Add("Запустите 'Запустить Yargram.bat' и подтвердите запрос UAC.")
    }
    else {
        Write-Host "[OK] Windows Firewall разрешает TCP $($requiredRule.Port) только по настроенному правилу." -ForegroundColor Green
    }
}

Write-Host ""
if ($problems.Count -eq 0) {
    Write-Host "Yargram готов. Ссылка другу:" -ForegroundColor Green
    Write-Host $httpUrl -ForegroundColor Yellow
    Write-Host "Для звонков (если HTTPS отвечает): $httpsUrl" -ForegroundColor DarkGray
    exit 0
}

Write-Host "Что исправить:" -ForegroundColor Yellow
foreach ($problem in $problems | Select-Object -Unique) {
    Write-Host "- $problem"
}
exit 1
