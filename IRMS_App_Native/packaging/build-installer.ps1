param(
    [string]$MakeNsis = "$env:LOCALAPPDATA\tauri\NSIS\Bin\makensis.exe",
    [string]$VcRuntime,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path $PSScriptRoot -Parent
$cargoManifest = Get-Content (Join-Path $nativeRoot 'Cargo.toml') -Raw
$appVersion = [regex]::Match($cargoManifest, '(?m)^version = "([^"]+)"').Groups[1].Value
if ($appVersion -ne '1.3.0-beta.12') { throw 'Update the NSIS numeric version before changing the release version.' }
if (!(Test-Path -LiteralPath $MakeNsis)) { throw "NSIS not found: $MakeNsis" }
if (!$SkipBuild) {
    & cargo build --release --locked --manifest-path (Join-Path $nativeRoot 'Cargo.toml') -j 1
    if ($LASTEXITCODE -ne 0) { throw 'Native release build failed' }
}
$appExe = Join-Path $nativeRoot 'target\release\irms_app_native.exe'
if (!(Test-Path -LiteralPath $appExe)) { throw 'Release executable not found' }
$binaryVersion = (Get-Item -LiteralPath $appExe).VersionInfo.ProductVersion
if ($binaryVersion -ne $appVersion) { throw "Executable version mismatch: $binaryVersion" }
$outputDir = Join-Path $nativeRoot 'target\installer'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$outputFile = Join-Path $outputDir "IRMS_${appVersion}_x64-setup.exe"
if (!$VcRuntime) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (!(Test-Path -LiteralPath $vswhere)) { throw 'Pass -VcRuntime with the x64 redistributable vcruntime140.dll path.' }
    $VcRuntime = & $vswhere -latest -products '*' -find '**\x64\Microsoft.VC*.CRT\vcruntime140.dll' |
        Where-Object { $_ -notmatch '\\onecore\\' } | Select-Object -First 1
}
if (!$VcRuntime -or !(Test-Path -LiteralPath $VcRuntime)) { throw 'Microsoft x64 vcruntime140.dll redistributable not found.' }
$runtimeSignature = Get-AuthenticodeSignature -LiteralPath $VcRuntime
if ($runtimeSignature.Status -ne 'Valid' -or $runtimeSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'The Visual C++ runtime must have a valid Microsoft signature.'
}
$noticesFile = Join-Path $outputDir 'THIRD-PARTY-NOTICES.txt'
# 一併收錄 Windows 相依套件的授權宣告與其隨附授權全文。
$metadataJson = & cargo metadata --locked --offline --format-version 1 --filter-platform x86_64-pc-windows-msvc --manifest-path (Join-Path $nativeRoot 'Cargo.toml')
if ($LASTEXITCODE -ne 0) { throw 'Dependency metadata failed' }
$metadata = $metadataJson | ConvertFrom-Json
$notices = [System.Text.StringBuilder]::new()
[void]$notices.AppendLine('IRMS Native Beta - Third-party notices')
[void]$notices.AppendLine('Slint is used under LicenseRef-Slint-Royalty-free-2.0. See the About dialog for the official attribution widget.')
[void]$notices.AppendLine('Package license expressions may offer alternatives. Included texts preserve the notices supplied by upstream packages, including build tools.')
[void]$notices.AppendLine("Microsoft Visual C++ runtime: vcruntime140.dll $((Get-Item -LiteralPath $VcRuntime).VersionInfo.FileVersion). Copyright Microsoft Corporation. All rights reserved.")
[void]$notices.AppendLine('Application-local redistribution under the Visual Studio license: https://learn.microsoft.com/visualstudio/releases/2026/redistribution')
foreach ($package in ($metadata.packages | Where-Object source | Sort-Object name, version)) {
    [void]$notices.AppendLine("`n===== $($package.name) $($package.version) =====")
    [void]$notices.AppendLine("License: $($package.license)")
    [void]$notices.AppendLine("Repository: $($package.repository)")
    $packageRoot = Split-Path $package.manifest_path -Parent
    $licenseFiles = @(Get-ChildItem -LiteralPath $packageRoot -File | Where-Object Name -Match '^(LICENSE|LICENCE|COPYING|NOTICE|AUTHORS|COPYRIGHT)')
    $licenseDir = Join-Path $packageRoot 'LICENSES'
    if (Test-Path -LiteralPath $licenseDir -PathType Container) {
        $licenseFiles += Get-ChildItem -LiteralPath $licenseDir -Recurse -File
    }
    if ($package.license_file) {
        $licenseFiles += Get-Item -LiteralPath (Join-Path $packageRoot $package.license_file)
    }
    foreach ($licenseFile in ($licenseFiles | Sort-Object FullName -Unique)) {
        [void]$notices.AppendLine("--- $($licenseFile.Name) ---")
        [void]$notices.AppendLine([System.IO.File]::ReadAllText($licenseFile.FullName))
    }
}
[System.IO.File]::WriteAllText($noticesFile, $notices.ToString(), [System.Text.UTF8Encoding]::new($false))
Push-Location $PSScriptRoot
try {
    & $MakeNsis /INPUTCHARSET UTF8 /V3 "/DAPP_VERSION=$appVersion" "/DAPP_EXE=$appExe" "/DOUTPUT_FILE=$outputFile" "/DNOTICES_FILE=$noticesFile" "/DVC_RUNTIME=$VcRuntime" installer.nsi
    if ($LASTEXITCODE -ne 0) { throw 'NSIS build failed' }
} finally { Pop-Location }
# 將下載檔的雜湊寫成可直接核對的標準格式。
$hash = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$outputFile.sha256" -Value "$hash  $(Split-Path $outputFile -Leaf)" -Encoding ascii
Get-Item -LiteralPath $outputFile
