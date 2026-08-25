# Netie Clicks — start local STT sidecar (faster-whisper, multilingual)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$env:NETIE_STT_MODEL = if ($env:NETIE_STT_MODEL) { $env:NETIE_STT_MODEL } else { "small" }
$env:NETIE_STT_DEVICE = if ($env:NETIE_STT_DEVICE) { $env:NETIE_STT_DEVICE } else { "cpu" }
$env:NETIE_STT_PORT = if ($env:NETIE_STT_PORT) { $env:NETIE_STT_PORT } else { "8766" }

Write-Host "Installing/checking deps (Python 3.12)…"
py -3.12 -m pip install -q "faster-whisper>=1.1.0" fastapi uvicorn python-multipart

Write-Host "Starting Netie STT on http://127.0.0.1:$($env:NETIE_STT_PORT) (model=$($env:NETIE_STT_MODEL), device=$($env:NETIE_STT_DEVICE))"
Write-Host "Rojak: Chinese + English + Malay code-switch enabled (multilingual=True)."
Write-Host "Later GPU: `$env:NETIE_STT_DEVICE='cuda'; `$env:NETIE_STT_MODEL='medium'  (12GB VRAM OK)"
py -3.12 "$Root\scripts\stt_sidecar.py"
