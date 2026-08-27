# Install UACC (Universal AI Computer Control) for Pointer.
# Windows-first. Linux pip often fails on evdev; that is not the product target.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install_uacc.ps1
$ErrorActionPreference = "Stop"
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) { throw "python not on PATH" }
& $py.Source -m pip install uacc
& $py.Source -c "import uacc; print('uacc', getattr(uacc,'__version__','ok'))"
