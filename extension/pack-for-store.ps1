# Builds dist\siteblocker-store.zip for the Chrome Web Store / Edge Add-ons.
# The store assigns its own extension ID, so the dev-only "key" field is removed from the packaged manifest.
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$dist = Join-Path (Split-Path $root -Parent) "dist"
$stage = Join-Path $dist "store-stage"
$zip = Join-Path $dist "siteblocker-store.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item (Join-Path $root "src") (Join-Path $stage "src") -Recurse

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$manifest.PSObject.Properties.Remove("key")
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $stage "manifest.json") -Encoding utf8

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
