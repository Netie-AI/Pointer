<#
.SYNOPSIS
  Put one icon on the desktop for each Netie app.

.DESCRIPTION
  Three shortcuts, each launching through scripts\netie-launch.ps1 so the
  dependency order is honoured no matter which one you click:

      Netie Pointer   -> starts OpenVault + Cortex first, then Pointer
      Netie Cortex    -> starts OpenVault first, then Cortex
      Netie OpenVault -> starts OpenVault

  Clicking one whose services are already running is a no-op, so it is safe to
  click twice.

  Run with -Remove to take them off again. This only ever writes to your
  Desktop folder; nothing else on the machine is touched.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-desktop-icons.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install-desktop-icons.ps1 -Remove
#>
[CmdletBinding()]
param([switch]$Remove)

$ErrorActionPreference = "Stop"

$Launcher = Join-Path $PSScriptRoot "netie-launch.ps1"
if (-not (Test-Path $Launcher)) { throw "launcher not found: $Launcher" }

$Desktop = [Environment]::GetFolderPath("Desktop")

# IconLocation: use each app's own icon where one exists, else a stock shell
# icon so the three are at least distinguishable at a glance.
$Apps = @(
  @{ Name = "Netie Pointer";   App = "pointer";   Icon = "D:\Pointer\assets\icons\system-audio-dark.png" }
  @{ Name = "Netie Cortex";    App = "cortex";    Icon = "$env:SystemRoot\System32\imageres.dll,109" }
  @{ Name = "Netie OpenVault"; App = "openvault"; Icon = "$env:SystemRoot\System32\imageres.dll,54" }
)

$shell = New-Object -ComObject WScript.Shell

foreach ($a in $Apps) {
  $lnk = Join-Path $Desktop "$($a.Name).lnk"

  if ($Remove) {
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "removed $($a.Name)" }
    else { Write-Host "not present: $($a.Name)" }
    continue
  }

  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  # -WindowStyle Hidden so a console does not flash and linger; the launcher
  # starts each service in its own minimised window.
  $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`" -App $($a.App)"
  $sc.WorkingDirectory = Split-Path $Launcher -Parent
  $sc.Description = "Start $($a.Name) and everything it depends on"

  # A .png is not a valid shortcut icon; fall back rather than write a broken one.
  if ($a.Icon -and ($a.Icon -notmatch '\.png$') -and (Test-Path ($a.Icon -split ',')[0])) {
    $sc.IconLocation = $a.Icon
  } else {
    $sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,3"
  }

  $sc.Save()
  Write-Host "created $($a.Name)"
}

if (-not $Remove) {
  Write-Host ""
  Write-Host "Three icons are on your desktop. Click Pointer and it starts the"
  Write-Host "other two first; already-running services are left alone."
}
