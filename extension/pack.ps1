# Builds a zip of the extension in dist\ (next to the extension folder).
#
#   pack.ps1                    -> dist\SiteBlocker-extension-v<version>.zip   (default: "release")
#   pack.ps1 -Target store      -> dist\siteblocker-store.zip
#
# release: unzip it and load the folder with "Load unpacked". It keeps the manifest "key", so the extension ID stays
#          kpinpjjnhkllnpfpblbobpjbijjeadcd and the Windows app's native host registration keeps matching.
# store:   for the Chrome Web Store / Edge Add-ons. The "key" is removed because the store assigns its own ID.
param(
    [ValidateSet("release", "store")]
    [string]$Target = "release"
)
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$dist = Join-Path (Split-Path $root -Parent) "dist"
$stage = Join-Path $dist "$Target-stage"

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$zip = if ($Target -eq "store") { Join-Path $dist "siteblocker-store.zip" } else { Join-Path $dist "SiteBlocker-extension-v$version.zip" }

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# Only the files the browser needs: no tests, no node_modules, no package.json.
Copy-Item (Join-Path $root "src") (Join-Path $stage "src") -Recurse

if ($Target -eq "store") { $manifest.PSObject.Properties.Remove("key") }
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $stage "manifest.json") -Encoding utf8

if ($Target -eq "release") {
    @"
SiteBlocker extension v$version

1. Unzip this archive into a folder you will keep (the browser loads it from there, so do not delete it).
2. Open chrome://extensions (or edge://extensions, brave://extensions) and turn on Developer mode.
3. Click "Load unpacked" and choose that folder.
4. Click the SiteBlocker icon in the toolbar to open its options page and choose a password.

The extension ID is fixed (kpinpjjnhkllnpfpblbobpjbijjeadcd). Shutdown mode and the Windows app link need the
SiteBlocker Windows app to have been run once on this PC.
"@ | Set-Content (Join-Path $stage "LOAD-ME.txt") -Encoding utf8
}

if (Test-Path $zip) { Remove-Item $zip -Force }

# Compress-Archive in Windows PowerShell 5.1 writes backslash entry names, which stores can reject.
# Build the zip by hand so entries use forward slashes.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
    $prefix = (Resolve-Path $stage).Path.TrimEnd('\') + '\'
    foreach ($file in Get-ChildItem $stage -Recurse -File) {
        $entryName = $file.FullName.Substring($prefix.Length).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
    }
}
finally {
    $archive.Dispose()
}
Remove-Item $stage -Recurse -Force

Write-Host "Created $zip"
