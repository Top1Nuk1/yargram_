[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Раньше правило открывало порт только для подсети Radmin VPN (26.0.0.0/8):
# адрес был локальным и в интернет не смотрел. Теперь Yargram может работать
# через публичное имя (туннель или VPS), и тогда серверу нужно принимать
# соединения снаружи — иначе до него не дойдёт даже локальный cloudflared.
#
# Поэтому удалённая подсеть берётся из YARGRAM_ALLOWED_NETWORKS: по умолчанию
# остаётся прежняя Radmin-подсеть, а для публичной работы укажите там `any`
# или конкретную подсеть.
$allowedNetworks = $env:YARGRAM_ALLOWED_NETWORKS
if ([string]::IsNullOrWhiteSpace($allowedNetworks)) {
    $allowedNetworks = "26.0.0.0/8"
}
$acceptedRemoteRanges = @($allowedNetworks -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
$firewallDescription = if ($acceptedRemoteRanges -contains "any") {
    "Yargram: доступ снаружи (публичный адрес)."
} else {
    "Yargram access for peers on $allowedNetworks."
}

$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($currentIdentity)
$administratorRole = [System.Security.Principal.WindowsBuiltInRole]::Administrator
if (-not $principal.IsInRole($administratorRole)) {
    throw "Запустите PowerShell от имени администратора и повторите команду."
}

function New-YargramFirewallRule {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    New-NetFirewallRule `
        -Name $Name `
        -DisplayName $DisplayName `
        -Description $firewallDescription `
        -Enabled True `
        -Direction Inbound `
        -Action Allow `
        -Profile Any `
        -Protocol TCP `
        -LocalPort $Port `
        -RemoteAddress $acceptedRemoteRanges | Out-Null
}

# Запасной путь на случай, когда cmdlet-ы Windows не сработали: netsh делает то
# же самое и присутствует в любой Windows. Имя правила принадлежит Yargram,
# поэтому удалить прежнее правило с этим именем безопасно.
function Add-YargramFirewallRuleWithNetsh {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port
    )

    & netsh advfirewall firewall delete rule "name=$Name" | Out-Null
    & netsh advfirewall firewall add rule `
        "name=$Name" `
        "dir=in" `
        "action=allow" `
        "protocol=TCP" `
        "localport=$Port" `
        "remoteip=$($acceptedRemoteRanges -join ',')" `
        "profile=any" `
        "enable=yes" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "netsh не смог создать правило TCP $Port (код $LASTEXITCODE)."
    }
}

function Ensure-YargramFirewallRule {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    try {
        $existingRule = Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue
        if ($null -eq $existingRule) {
            New-YargramFirewallRule -Name $Name -DisplayName $DisplayName -Port $Port
            Write-Host "Добавлено правило: TCP $Port для $allowedNetworks." -ForegroundColor Green
            return
        }

        $portFilters = @($existingRule | Get-NetFirewallPortFilter)
        $addressFilters = @($existingRule | Get-NetFirewallAddressFilter)
        $isExpectedRule = $existingRule.Direction -eq "Inbound" -and
            $existingRule.Action -eq "Allow" -and
            $portFilters.Count -eq 1 -and
            $portFilters[0].Protocol -eq "TCP" -and
            "$($portFilters[0].LocalPort)" -eq "$Port" -and
            $addressFilters.Count -eq 1 -and
            @($addressFilters[0].RemoteAddress | Where-Object {
                    $acceptedRemoteRanges -contains $_
                }).Count -gt 0

        if (-not $isExpectedRule) {
            # Подсеть доступа могла смениться (Radmin отдаёт адрес заново,
            # либо проект переехал на публичное имя). Пересоздаём правило, а не
            # отказываемся работать: имя правила принадлежит Yargram.
            Write-Host "Правило '$Name' не подходит для $allowedNetworks — пересоздаём." -ForegroundColor Yellow
            Remove-NetFirewallRule -Name $Name
            New-YargramFirewallRule -Name $Name -DisplayName $DisplayName -Port $Port
            Write-Host "Правило обновлено: TCP $Port для $allowedNetworks." -ForegroundColor Green
            return
        }

        if ($existingRule.Enabled -ne "True") {
            Enable-NetFirewallRule -Name $Name | Out-Null
        }
        Write-Host "[OK] Windows Firewall: TCP $Port для $allowedNetworks." -ForegroundColor Green
    }
    catch {
        Write-Warning "Не удалось настроить правило '$Name' средствами Windows: $($_.Exception.Message)"
        Add-YargramFirewallRuleWithNetsh -Name $Name -Port $Port
        Write-Host "Правило TCP $Port создано через netsh: $allowedNetworks." -ForegroundColor Green
    }
}

# Keep the original internal name for compatibility with the already-created
# rule. PowerShell rule lookup is case-insensitive, while visible text uses Yargram.
$httpPort = 3000
if (-not [string]::IsNullOrWhiteSpace($env:PORT)) {
    $httpPort = [int]$env:PORT
}
$httpsPort = 3443
if (-not [string]::IsNullOrWhiteSpace($env:HTTPS_PORT)) {
    $httpsPort = [int]$env:HTTPS_PORT
}

Ensure-YargramFirewallRule `
    -Name "YarGram-Temporary-TCP-$httpPort" `
    -DisplayName "Yargram server (TCP $httpPort)" `
    -Port $httpPort
Ensure-YargramFirewallRule `
    -Name "Yargram-Temporary-TCP-$httpsPort" `
    -DisplayName "Yargram secure calls (TCP $httpsPort)" `
    -Port $httpsPort
