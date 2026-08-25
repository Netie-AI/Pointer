<#
.SYNOPSIS
  Start one Netie service and whatever it needs, then get out of the way.

.DESCRIPTION
  The three services have a real dependency order and nothing enforced it, so
  starting Pointer first meant a HUD that fail-closed on every action because
  Cortex was not up yet -- which reads as "the app is broken", not "start the
  engine first".

      Pointer   needs Cortex (security gate) and OpenVault (keys)
      Cortex    needs OpenVault (model keys)
      OpenVault needs nothing

  Already-running services are left alone. This checks a port before starting
  anything, so double-clicking the icon twice does not give you two vaults, and
  it never restarts a service you are already using.

.PARAMETER App
  pointer | cortex | openvault | all

.PARAMETER Restart
  Stop the target's dependencies and start them fresh. Off by default: killing a
  service someone is mid-session with should be something you ask for.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\netie-launch.ps1 -App pointer
#>
[CmdletBinding()]
param(
  [ValidateSet("pointer", "cortex", "openvault", "all")]
  [string]$App = "pointer",
  [switch]$Restart,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$Services = @{
  openvault = @{
    Name    = "OpenVault"
    Port    = 5000
    Health  = "http://127.0.0.1:5000/api/keys"
    Cwd     = "D:\OpenVault\OpenMW"
    Exe     = "D:\OpenVault\OpenMW\.venv\Scripts\openmw.exe"
    Args    = @("console", "--host", "127.0.0.1", "--port", "5000",
                "--cortex-url", "http://127.0.0.1:8010",
                "--openide-url", "http://127.0.0.1:8765",
                "--no-open-browser", "--mock-health")
    Needs   = @()
    WaitSec = 45
  }
  cortex = @{
    Name    = "Cortex"
    Port    = 8010
    Health  = "http://127.0.0.1:8010/health"
    Cwd     = "D:\Cortex"
    Exe     = "python"
    Args    = @("-m", "uvicorn", "CortexOS.api.main:app", "--host", "127.0.0.1", "--port", "8010")
    Needs   = @("openvault")
    WaitSec = 60
  }
  pointer = @{
    Name    = "Pointer"
    Port    = $null   # Electron app, not a server -- nothing to poll.
    Health  = $null
    Cwd     = "D:\Pointer"
    Exe     = "npm"
    Args    = @("start")
    Needs   = @("openvault", "cortex")
    WaitSec = 0
  }
}

function Write-Step($msg) { if (-not $Quiet) { Write-Host "  $msg" } }

function Test-PortOpen([int]$Port) {
  if (-not $Port) { return $false }
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

function Test-Healthy($svc) {
  # A listening port is not a working service: uvicorn accepts connections
  # before the app finishes importing. Prefer the health URL where there is one.
  if (-not $svc.Health) { return (Test-PortOpen $svc.Port) }
  try {
    $r = Invoke-WebRequest -Uri $svc.Health -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
    return $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-Service-OnPort($svc) {
  if (-not $svc.Port) { return }
  $c = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) {
    Write-Step "stopping $($svc.Name) (pid $($c.OwningProcess))"
    taskkill /PID $c.OwningProcess /T /F 2>&1 | Out-Null
    Start-Sleep -Milliseconds 700
  }
}

function Start-One($key) {
  $svc = $Services[$key]

  if ($Restart -and $svc.Port) { Stop-Service-OnPort $svc }

  if ($svc.Port -and (Test-Healthy $svc)) {
    Write-Step "$($svc.Name) already up on :$($svc.Port)"
    return $true
  }

  if (-not (Test-Path $svc.Cwd)) {
    Write-Warning "$($svc.Name): $($svc.Cwd) not found -- skipped"
    return $false
  }

  Write-Step "starting $($svc.Name)..."
  Start-Process -FilePath $svc.Exe -ArgumentList $svc.Args -WorkingDirectory $svc.Cwd `
                -WindowStyle Minimized | Out-Null

  if (-not $svc.WaitSec -or -not $svc.Health) { return $true }

  $deadline = (Get-Date).AddSeconds($svc.WaitSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 900
    if (Test-Healthy $svc) {
      Write-Step "$($svc.Name) ready on :$($svc.Port)"
      return $true
    }
  }
  Write-Warning "$($svc.Name) did not answer $($svc.Health) within $($svc.WaitSec)s"
  return $false
}

function Start-WithDeps($key, $seen) {
  if ($seen.Contains($key)) { return $true }
  [void]$seen.Add($key)
  $ok = $true
  foreach ($dep in $Services[$key].Needs) {
    if (-not (Start-WithDeps $dep $seen)) { $ok = $false }
  }
  # Start the target even if a dependency was unhealthy: Pointer fail-closes
  # loudly when Cortex is down, and that is more useful than refusing to launch.
  if (-not (Start-One $key)) { $ok = $false }
  return $ok
}

if (-not $Quiet) { Write-Host "Netie launcher - $App" }
$seen = New-Object System.Collections.Generic.HashSet[string]
$targets = if ($App -eq "all") { @("openvault", "cortex", "pointer") } else { @($App) }

$allOk = $true
foreach ($t in $targets) { if (-not (Start-WithDeps $t $seen)) { $allOk = $false } }

if (-not $Quiet) {
  Write-Host ""
  foreach ($k in @("openvault", "cortex")) {
    $s = $Services[$k]
    $state = if (Test-Healthy $s) { "up" } else { "DOWN" }
    Write-Host ("  {0,-10} :{1,-6} {2}" -f $s.Name, $s.Port, $state)
  }
}

exit $(if ($allOk) { 0 } else { 1 })
