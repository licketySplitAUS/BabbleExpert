param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Installer tests run only on disposable CI machines.' }
$smokeRoot = Join-Path ([IO.Path]::GetTempPath()) ('be-smoke-install-' + [guid]::NewGuid().ToString('N'))
$installedRoot = Join-Path $smokeRoot 'app'
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
$oldInstaller = Join-Path $smokeRoot 'old-setup.exe'
Invoke-WebRequest 'https://github.com/licketySplitAUS/BabbleExpert/releases/download/v3.2.11/BabbleExpert-Windows-Setup.exe' -OutFile $oldInstaller
$oldManifest = (Invoke-WebRequest 'https://github.com/licketySplitAUS/BabbleExpert/releases/download/v3.2.11/latest.yml').Content
$expectedHash = [regex]::Match($oldManifest, '(?m)^sha512:\s*(\S+)').Groups[1].Value
$actualHash = [Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes($oldInstaller)))
if (!$expectedHash -or $actualHash -ne $expectedHash) { throw 'Previous installer checksum mismatch.' }
$old = Start-Process -FilePath $oldInstaller -ArgumentList @('/S', "/D=$installedRoot") -WindowStyle Hidden -Wait -PassThru
if ($old.ExitCode -ne 0) { throw 'Previous installer failed.' }
$upgrade = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -ArgumentList @('/S', "/D=$installedRoot") -WindowStyle Hidden -Wait -PassThru
if ($upgrade.ExitCode -ne 0) { throw 'Upgrade installer failed.' }
& node tools/release/packaged-smoke.cjs (Join-Path $installedRoot 'Babble Expert.exe')
if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Babble Expert.lnk'
if (!(Test-Path -LiteralPath $shortcut)) { throw 'Desktop shortcut missing after upgrade.' }
$shellObject = New-Object -ComObject WScript.Shell
if ($shellObject.CreateShortcut($shortcut).TargetPath -ne (Join-Path $installedRoot 'Babble Expert.exe')) { throw 'Shortcut target does not point at the installed app.' }
Write-Output 'PASS Windows silent install, in-place upgrade, installed startup, rapid launches and shortcut.'
$uninstall = Start-Process -FilePath (Join-Path $installedRoot 'Uninstall Babble Expert.exe') -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw 'CI uninstall failed.' }
$freshRoot = Join-Path $smokeRoot 'fresh-app'
$fresh = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -ArgumentList @('/S', "/D=$freshRoot") -WindowStyle Hidden -Wait -PassThru
if ($fresh.ExitCode -ne 0) { throw 'Fresh installer failed.' }
& node tools/release/packaged-smoke.cjs (Join-Path $freshRoot 'Babble Expert.exe')
if ($LASTEXITCODE -ne 0) { throw 'Fresh installed application smoke test failed.' }
Write-Output 'PASS fresh Windows installation.'
