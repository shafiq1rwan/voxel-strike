# Zip dist-poki/ into voxelstrike-poki.zip for the Poki Inspector upload.
# Not Compress-Archive: on Windows PowerShell 5.1 it writes entry paths with
# backslashes ("assets\index.js"), which Linux unzips as flat filenames and
# breaks every asset URL. Entries here always use forward slashes.
# The file is named after package.json's version (zip:poki bumps the patch
# number first), e.g. voxelstrike-poki-0.3.4.zip, matching the title footer.
# Usage: npm run zip:poki   (bumps the version, builds, then zips)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'dist-poki'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $root "voxelstrike-poki-$version.zip"
if (-not (Test-Path (Join-Path $src 'index.html'))) { throw 'dist-poki/index.html missing - run npm run build:poki first' }
if (Test-Path $out) { Remove-Item $out -Confirm:$false }

$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
  Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')
  }
} finally {
  $zip.Dispose()
}
'{0} ({1:N0} bytes)' -f $out, (Get-Item $out).Length
