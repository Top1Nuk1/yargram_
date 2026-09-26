[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$localAddress = "26.53.76.128"
if ($env:RADMIN_IP) {
    $localAddress = $env:RADMIN_IP
}
$radminAddressRange = "26.0.0.0/8"
$acceptedRadminRanges = @($radminAddressRange, "26.0.0.0/255.0.0.0")

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
        -Description "Temporary Yargram access for peers connected through Radmin VPN." `
        -Enabled True `
        -Direction Inbound `
        -Action Allow `
        -Profile Any `
        -Protocol TCP `
        -LocalPort $Port `
        -LocalAddress $localAddress `
        -RemoteAddress $radminAddressRange | Out-Null
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
        "localip=$localAddress" `
        "remoteip=$radminAddressRange" `
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
            Write-Host "Добавлено правило: TCP $Port на $localAddress только для Radmin VPN ($radminAddressRange)." -ForegroundColor Green
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
            @($addressFilters[0].LocalAddress) -contains $localAddress -and
            @($addressFilters[0].RemoteAddress | Where-Object {
                    $acceptedRadminRanges -contains $_
                }).Count -gt 0

        if (-not $isExpectedRule) {
            # Адрес Radmin VPN периодически меняется, поэтому правило могло
            # остаться от прежнего адреса. Пересоздаём его, а не отказываемся
            # работать: имя правила принадлежит Yargram.
            Write-Host "Правило '$Name' не подходит адресу $localAddress — пересоздаём." -ForegroundColor Yellow
            Remove-NetFirewallRule -Name $Name
            New-YargramFirewallRule -Name $Name -DisplayName $DisplayName -Port $Port
            Write-Host "Правило обновлено: TCP $Port на $localAddress только для Radmin VPN." -ForegroundColor Green
            return
        }

        if ($existingRule.Enabled -ne "True") {
            Enable-NetFirewallRule -Name $Name | Out-Null
        }
        Write-Host "[OK] Windows Firewall: TCP $Port только через Radmin VPN." -ForegroundColor Green
    }
    catch {
        Write-Warning "Не удалось настроить правило '$Name' средствами Windows: $($_.Exception.Message)"
        Add-YargramFirewallRuleWithNetsh -Name $Name -Port $Port
        Write-Host "Правило TCP $Port создано через netsh: $localAddress, Radmin VPN ($radminAddressRange)." -ForegroundColor Green
    }
}

# Keep the original internal name for compatibility with the already-created
# rule. PowerShell rule lookup is case-insensitive, while visible text uses Yargram.
Ensure-YargramFirewallRule `
    -Name "YarGram-Temporary-TCP-3000" `
    -DisplayName "Yargram temporary server (TCP 3000)" `
    -Port 3000
Ensure-YargramFirewallRule `
    -Name "Yargram-Temporary-TCP-3443" `
    -DisplayName "Yargram secure calls (TCP 3443)" `
    -Port 3443
