# Installer regression test: install an OLD build into a temp folder, run it, update it in place with the
# NEW installer in /SELFUPDATE mode (as the app's self-updater does), then uninstall with the app running.
#
#   ./packaging/test-installer.ps1 -Old <old-setup.exe> -New <new-setup.exe>
#
# It checks: the running old app is closed by the installer, the new version is installed and restarted,
# an installed Tauri app is left alone, the uninstaller closes a running app and removes registry keys,
# shortcuts and the native data folder is NOT touched by uninstall (it is deleted here only if this test
# created it). Nothing outside a temp folder is left behind.
param(
    [Parameter(Mandatory)] [string]$Old,
    [Parameter(Mandatory)] [string]$New
)
$ErrorActionPreference = 'Stop'
$failures = @()
function Check($name, $ok) {
    if ($ok) { Write-Host "PASS  $name" } else { Write-Host "FAIL  $name"; $script:failures += $name }
}
$tauriKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMS Dashboard'
$nativeKeys = @('HKCU:\Software\IRMS\NativeBeta', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\IRMSNativeBeta')
if ($nativeKeys | Where-Object { Test-Path $_ }) { throw 'A native beta is already installed here; this test would overwrite its registration. Run it on a machine without one.' }
$dataDir = Join-Path $env:LOCALAPPDATA 'irms-native-prototype'
$dataExisted = Test-Path $dataDir
$tauriBefore = Test-Path $tauriKey
$work = Join-Path $env:TEMP 'irms_installer_test'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $work | Out-Null
$app = Join-Path $work 'app'
$exe = Join-Path $app 'irms_app_native.exe'
try {
    Start-Process $Old -ArgumentList '/S', "/D=$app" -Wait
    Check 'old build installs silently' (Test-Path $exe)
    $oldVersion = (Get-Item $exe).VersionInfo.ProductVersion
    $p = Start-Process $exe -ArgumentList @('--simulate', '--db', ':memory:') -PassThru
    Start-Sleep 3
    Check 'old app is running' ([bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue))

    $i = Start-Process $New -ArgumentList '/SELFUPDATE' -PassThru
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while (-not $i.HasExited -and $sw.Elapsed.TotalSeconds -lt 90) { Start-Sleep -Milliseconds 300 }
    Check '/SELFUPDATE finishes by itself (no dialog)' $i.HasExited
    Start-Sleep 3
    Check 'old process was closed' (-not (Get-Process -Id $p.Id -ErrorAction SilentlyContinue))
    $newVersion = (Get-Item $exe).VersionInfo.ProductVersion
    Check "version changed ($oldVersion -> $newVersion)" ($newVersion -ne $oldVersion)
    Check 'new version was restarted' ([bool](Get-Process irms_app_native -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }))
    Check 'Tauri app untouched by the self-update' ((Test-Path $tauriKey) -eq $tauriBefore)

    $sw = [Diagnostics.Stopwatch]::StartNew()
    Start-Process (Join-Path $app 'Uninstall.exe') -ArgumentList '/S', "_?=$app" -Wait
    Start-Sleep 2
    Check 'uninstaller closed the running app' (-not (Get-Process irms_app_native -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }))
    Check 'uninstall removed the executable' (-not (Test-Path $exe))
    foreach ($k in $nativeKeys) { Check "registry key removed: $k" (-not (Test-Path $k)) }
    Check 'Start menu folder removed' (-not (Test-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\IRMS Native Beta')))
    Check 'Tauri app untouched by uninstall' ((Test-Path $tauriKey) -eq $tauriBefore)
}
finally {
    Get-Process irms_app_native -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$work*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    # The relaunched app creates its data folder; remove it only when this test created it.
    if (-not $dataExisted) { Remove-Item $dataDir -Recurse -Force -ErrorAction SilentlyContinue }
}
if ($failures.Count) { Write-Host "`n$($failures.Count) check(s) failed"; exit 1 }
Write-Host "`nAll installer checks passed"
