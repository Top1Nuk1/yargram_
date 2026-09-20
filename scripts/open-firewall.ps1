[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$localAddress = "26.236.251.44"
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

function Ensure-YargramFirewallRule {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $existingRule = Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existingRule) {
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
            throw "Правило '$Name' уже существует, но имеет другие параметры. Оно не было изменено."
        }

        if ($existingRule.Enabled -ne "True") {
            Enable-NetFirewallRule -Name $Name | Out-Null
        }
        Write-Host "[OK] Windows Firewall: TCP $Port только через Radmin VPN." -ForegroundColor Green
        return
    }

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

    Write-Host "Добавлено правило: TCP $Port на $localAddress только для Radmin VPN ($radminAddressRange)." -ForegroundColor Green
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
