#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Always validate with the Windows PowerShell parser, even when called from pwsh.
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    exit $LASTEXITCODE
}

$scripts = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File -Recurse | Sort-Object FullName)
$errorCount = 0
foreach ($script in $scripts) {
    $parseTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
    foreach ($parseError in $parseErrors) {
        Write-Output ('{0}:{1}: {2}' -f $script.FullName, $parseError.Extent.StartLineNumber, $parseError.Message)
        $errorCount++
    }

    # PS 5.1 reads BOM-less source using the legacy ANSI code page.
    $bytes = [System.IO.File]::ReadAllBytes($script.FullName)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $hasUtf8Bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    if ($text -match '[\u0400-\u04FF]' -and -not $hasUtf8Bom) {
        Write-Output ('{0}:1: Cyrillic source requires a UTF-8 BOM for Windows PowerShell 5.1.' -f $script.FullName)
        $errorCount++
    }
}

if ($errorCount -gt 0) { exit 1 }
Write-Output ('Windows PowerShell {0} syntax and encoding OK: {1} scripts checked.' -f $PSVersionTable.PSVersion, $scripts.Count)
