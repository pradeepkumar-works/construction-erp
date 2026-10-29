# Nirmaan Connector: start with Windows and keep running in the background.
# Run in PowerShell as administrator, in the Connector's folder, after pairing it:
#   node dist\main.js pair <api-url> <code>
#   powershell -ExecutionPolicy Bypass -File install.ps1
# To take it off again: powershell -ExecutionPolicy Bypass -File install.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$task = 'Nirmaan Connector'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "$task removed. Its files stay in $env:ProgramData\Nirmaan Connector."
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js is not installed. Install Node.js 20 or later from nodejs.org, then run this again.' }
$main = Join-Path $PSScriptRoot 'dist\main.js'
if (-not (Test-Path $main)) { throw "dist\main.js is not here. Run this from the Nirmaan Connector folder." }
if (-not (Test-Path "$env:ProgramData\Nirmaan Connector\pairing.json")) { throw 'Pair it first: node dist\main.js pair <api-url> <code>' }

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$main`" run" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# Restarted every minute if it stops, for as long as the computer is on; never stopped for running long.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 9999 -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host "$task installed and started. Its log is $env:ProgramData\Nirmaan Connector\connector.log"
