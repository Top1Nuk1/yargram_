[CmdletBinding()]
param()

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$EnvironmentFile = Join-Path $ProjectRoot ".env"
$HttpsDirectory = Join-Path $ProjectRoot "runtime\https"
$PfxPath = Join-Path $HttpsDirectory "yargram-server.pfx"
$CaCertificatePath = Join-Path $HttpsDirectory "Yargram-Local-CA.cer"
$ServerIpAddress = "26.53.76.128"
if ($env:RADMIN_IP) {
    $ServerIpAddress = $env:RADMIN_IP
}
$HttpsPort = 3443
$CaSubject = "CN=Yargram Local CA"
$ServerSubject = "CN=$ServerIpAddress"

$Utf8Bom = New-Object System.Text.UTF8Encoding($true)

function New-RandomHex {
    param([ValidateRange(16, 256)][int]$ByteCount = 32)

    $bytes = New-Object byte[] $ByteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }

    return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $result = $null
    $pattern = '^\s*' + [System.Text.RegularExpressions.Regex]::Escape($Name) + '\s*=\s*(.*?)\s*$'
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -notmatch $pattern) {
            continue
        }

        $value = $Matches[1]
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        $result = $value
    }

    return $result
}

function Set-TlsDotEnvValues {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Password
    )

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $sourceLines = [System.IO.File]::ReadAllLines($Path)
    }
    else {
        $jwtSecret = New-RandomHex -ByteCount 48
        $sourceLines = @(
            "NODE_ENV=production",
            "HOST=0.0.0.0",
            "PORT=3000",
            "JWT_SECRET=$jwtSecret",
            "JWT_EXPIRES_IN=7d",
            "BCRYPT_ROUNDS=10",
            "CORS_ORIGINS=http://${ServerIpAddress}:3000,https://${ServerIpAddress}:${HttpsPort},http://localhost:3000,https://localhost:${HttpsPort},http://127.0.0.1:3000,https://127.0.0.1:${HttpsPort}"
        )
    }

    $portablePfxPath = ([System.IO.Path]::GetFullPath($PfxPath)).Replace("\", "/")
    $names = @("HTTPS_PORT", "TLS_PFX_PATH", "TLS_PFX_PASSWORD", "CORS_ORIGINS")
    $values = @{
        HTTPS_PORT = "$HttpsPort"
        TLS_PFX_PATH = $portablePfxPath
        TLS_PFX_PASSWORD = $Password
        CORS_ORIGINS = "http://${ServerIpAddress}:3000,https://${ServerIpAddress}:${HttpsPort},http://localhost:3000,https://localhost:${HttpsPort},http://127.0.0.1:3000,https://127.0.0.1:${HttpsPort},http://${ServerIpAddress}:5173,http://localhost:5173,http://127.0.0.1:5173"
    }
    $written = @{}
    $outputLines = New-Object System.Collections.Generic.List[string]

    foreach ($line in $sourceLines) {
        $matchedName = $null
        foreach ($name in $names) {
            if ($line -match ('^\s*' + [System.Text.RegularExpressions.Regex]::Escape($name) + '\s*=')) {
                $matchedName = $name
                break
            }
        }

        if ($null -eq $matchedName) {
            $outputLines.Add($line)
            continue
        }

        if (-not $written.ContainsKey($matchedName)) {
            $outputLines.Add("$matchedName=$($values[$matchedName])")
            $written[$matchedName] = $true
        }
    }

    foreach ($name in $names) {
        if (-not $written.ContainsKey($name)) {
            $outputLines.Add("$name=$($values[$name])")
        }
    }

    [System.IO.File]::WriteAllLines($Path, $outputLines.ToArray(), $Utf8Bom)
}

function New-X509CertificateFromFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (, $Path)
}

function New-X509CertificateFromPfx {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Password
    )

    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet
    $flagNames = [System.Enum]::GetNames([System.Security.Cryptography.X509Certificates.X509KeyStorageFlags])
    if ($flagNames -contains "EphemeralKeySet") {
        $flags = [System.Enum]::Parse(
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags],
            "EphemeralKeySet"
        )
    }

    return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 `
        -ArgumentList $Path, $Password, $flags
}

function Test-CertificateArtifacts {
    param([AllowEmptyString()][string]$Password)

    if ([string]::IsNullOrWhiteSpace($Password) -or
        $Password -notmatch '^[0-9a-fA-F]{64}$' -or
        -not (Test-Path -LiteralPath $PfxPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $CaCertificatePath -PathType Leaf)) {
        return $false
    }

    $leaf = $null
    $ca = $null
    try {
        $leaf = New-X509CertificateFromPfx -Path $PfxPath -Password $Password
        $ca = New-X509CertificateFromFile -Path $CaCertificatePath
        $now = [DateTime]::Now

        if (-not $leaf.HasPrivateKey -or
            $leaf.Subject -ne $ServerSubject -or
            $leaf.Issuer -ne $CaSubject -or
            $leaf.NotBefore -gt $now.AddMinutes(5) -or
            $leaf.NotAfter -lt $now.AddDays(30) -or
            $ca.Subject -ne $CaSubject -or
            $ca.Issuer -ne $CaSubject -or
            $ca.NotBefore -gt $now.AddMinutes(5) -or
            $ca.NotAfter -lt $now.AddDays(30)) {
            return $false
        }

        $basicConstraintsSource = $ca.Extensions |
            Where-Object { $_.Oid.Value -eq "2.5.29.19" } |
            Select-Object -First 1
        if ($null -eq $basicConstraintsSource) {
            return $false
        }
        $basicConstraints = New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension `
            -ArgumentList $basicConstraintsSource, $basicConstraintsSource.Critical
        if (-not $basicConstraints.CertificateAuthority) {
            return $false
        }

        $ekuSource = $leaf.Extensions |
            Where-Object { $_.Oid.Value -eq "2.5.29.37" } |
            Select-Object -First 1
        if ($null -eq $ekuSource) {
            return $false
        }
        $eku = New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension `
            -ArgumentList $ekuSource, $ekuSource.Critical
        $hasServerAuthentication = @($eku.EnhancedKeyUsages | Where-Object {
                $_.Value -eq "1.3.6.1.5.5.7.3.1"
            }).Count -gt 0
        if (-not $hasServerAuthentication) {
            return $false
        }

        $san = $leaf.Extensions |
            Where-Object { $_.Oid.Value -eq "2.5.29.17" } |
            Select-Object -First 1
        if ($null -eq $san) {
            return $false
        }
        $sanText = $san.Format($false)
        if ($sanText -notmatch [System.Text.RegularExpressions.Regex]::Escape($ServerIpAddress) -or
            $sanText -notmatch [System.Text.RegularExpressions.Regex]::Escape("127.0.0.1") -or
            $sanText -notmatch "(?i)localhost") {
            return $false
        }

        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $leaf) {
            $leaf.Dispose()
        }
        if ($null -ne $ca) {
            $ca.Dispose()
        }
    }
}

function Remove-PersonalCertificateByThumbprint {
    param([AllowEmptyString()][string]$Thumbprint)

    if ([string]::IsNullOrWhiteSpace($Thumbprint) -or $Thumbprint -notmatch '^[0-9A-Fa-f]{40,128}$') {
        return
    }

    $certificatePath = "Cert:\CurrentUser\My\$Thumbprint"
    if (Test-Path -LiteralPath $certificatePath) {
        Remove-Item -LiteralPath $certificatePath -Force
    }
}

function Remove-ExportedCertificatesFromPersonalStore {
    param([Parameter(Mandatory = $true)][string]$Password)

    $leaf = $null
    $ca = $null
    try {
        $leaf = New-X509CertificateFromPfx -Path $PfxPath -Password $Password
        $ca = New-X509CertificateFromFile -Path $CaCertificatePath
        $leafThumbprint = $leaf.Thumbprint
        $caThumbprint = $ca.Thumbprint
    }
    finally {
        if ($null -ne $leaf) {
            $leaf.Dispose()
        }
        if ($null -ne $ca) {
            $ca.Dispose()
        }
    }

    # These exact thumbprints came from Yargram's exported artifacts. Removing
    # their Personal-store copies also removes the temporary CA private key.
    Remove-PersonalCertificateByThumbprint -Thumbprint $leafThumbprint
    Remove-PersonalCertificateByThumbprint -Thumbprint $caThumbprint
}

function New-CertificateArtifacts {
    param([Parameter(Mandatory = $true)][string]$Password)

    if (-not (Test-Path -LiteralPath $HttpsDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $HttpsDirectory -Force | Out-Null
    }

    $caCertificate = $null
    $serverCertificate = $null
    try {
        $caCertificate = New-SelfSignedCertificate `
            -Type Custom `
            -Subject $CaSubject `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -KeyAlgorithm RSA `
            -KeyLength 4096 `
            -HashAlgorithm SHA256 `
            -KeyExportPolicy Exportable `
            -KeyUsage CertSign, CRLSign, DigitalSignature `
            -TextExtension @("2.5.29.19={critical}{text}ca=1&pathlength=0") `
            -NotAfter ([DateTime]::Now.AddYears(10))

        $serverCertificate = New-SelfSignedCertificate `
            -Type Custom `
            -Subject $ServerSubject `
            -Signer $caCertificate `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -HashAlgorithm SHA256 `
            -KeyExportPolicy Exportable `
            -KeyUsage DigitalSignature, KeyEncipherment `
            -TextExtension @(
                "2.5.29.19={critical}{text}ca=0",
                "2.5.29.17={text}ipaddress=$ServerIpAddress&ipaddress=127.0.0.1&dns=localhost",
                "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
            ) `
            -NotAfter ([DateTime]::Now.AddYears(3))

        $securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
        Export-Certificate `
            -Cert $caCertificate `
            -FilePath $CaCertificatePath `
            -Type CERT `
            -Force | Out-Null
        Export-PfxCertificate `
            -Cert $serverCertificate `
            -FilePath $PfxPath `
            -Password $securePassword `
            -ChainOption EndEntityCertOnly `
            -CryptoAlgorithmOption AES256_SHA256 `
            -Force | Out-Null
    }
    finally {
        if ($null -ne $serverCertificate) {
            Remove-PersonalCertificateByThumbprint -Thumbprint $serverCertificate.Thumbprint
        }
        if ($null -ne $caCertificate) {
            Remove-PersonalCertificateByThumbprint -Thumbprint $caCertificate.Thumbprint
        }
    }
}

function Ensure-CaCertificateTrusted {
    $ca = New-X509CertificateFromFile -Path $CaCertificatePath
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        "Root",
        [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    )
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $existing = $store.Certificates.Find(
            [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $ca.Thumbprint,
            $false
        )
        if ($existing.Count -eq 0) {
            $store.Add($ca)
        }
    }
    finally {
        $store.Close()
        $ca.Dispose()
    }
}

# Публичный архив сертификата для друга больше не создаётся: друг заходит по
# обычной HTTP-ссылке и ничего не скачивает и не устанавливает.

Write-Host "Yargram: подготовка локального HTTPS..." -ForegroundColor Cyan

$existingPassword = Get-DotEnvValue -Path $EnvironmentFile -Name "TLS_PFX_PASSWORD"
if (Test-CertificateArtifacts -Password $existingPassword) {
    $pfxPassword = $existingPassword
    Write-Host "Используются существующие действующие HTTPS-сертификаты." -ForegroundColor Green
}
else {
    $pfxPassword = New-RandomHex -ByteCount 32
    New-CertificateArtifacts -Password $pfxPassword
    if (-not (Test-CertificateArtifacts -Password $pfxPassword)) {
        throw "Созданные HTTPS-сертификаты не прошли проверку."
    }
    Write-Host "Созданы новые HTTPS-сертификаты Yargram." -ForegroundColor Green
}

Set-TlsDotEnvValues -Path $EnvironmentFile -Password $pfxPassword
Ensure-CaCertificateTrusted
Remove-ExportedCertificatesFromPersonalStore -Password $pfxPassword

Write-Host "Локальный сертификат доверен для текущего пользователя Windows." -ForegroundColor Green
Write-Host "HTTPS для звонков: https://${ServerIpAddress}:${HttpsPort}" -ForegroundColor Green
Write-Host "Ссылка другу: http://${ServerIpAddress}:3000 (сертификат не нужен)." -ForegroundColor Green
