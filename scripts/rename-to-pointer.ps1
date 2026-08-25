# Rename workspace folder to Pointer
# Close Cursor (and any terminals using D:\Netie Clicks) first, then:
#   powershell -ExecutionPolicy Bypass -File "D:\Netie Clicks\scripts\rename-to-pointer.ps1"
# Reopen the folder as D:\Pointer

$ErrorActionPreference = "Stop"
$src = "D:\Netie Clicks"
$dst = "D:\Pointer"

if (-not (Test-Path -LiteralPath $src)) {
  if (Test-Path -LiteralPath $dst) {
    Write-Host "Already renamed: $dst"
    exit 0
  }
  throw "Source not found: $src"
}

if (Test-Path -LiteralPath $dst) {
  throw "Destination already exists: $dst"
}

Rename-Item -LiteralPath $src -NewName "Pointer"
Write-Host "OK: $dst"
Write-Host "Reopen Cursor on D:\Pointer"
