# Watchdog do Sistema MIPs — religa containers parados sem recriar nada.
# Chamado pela tarefa agendada "MIPs-Watchdog" (no logon + a cada 5 min).
# Usa `compose start` (nunca `up -d`): `up` a partir de contextos diferentes
# (WSL /mnt/c vs Windows C:\) recria containers com bind mount em loop.
# `start` apenas liga o que esta parado — zero risco de flap.
$ErrorActionPreference = 'SilentlyContinue'

$dockerExe = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
$composeFile = 'C:\Users\Marcelo\Projetos\Sistema-MIPs\docker-compose.yml'

if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Start-Process "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
  Start-Sleep -Seconds 60
}

$stopped = & $dockerExe compose -f $composeFile ps -a --format json 2>$null |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.State -ne 'running' }
if ($stopped) {
  $names = @($stopped | ForEach-Object { $_.Service })
  & $dockerExe compose -f $composeFile start $names
}
