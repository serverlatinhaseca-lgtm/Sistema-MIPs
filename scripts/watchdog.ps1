# Watchdog do Portal - Nova Esperança — religa containers parados sem recriar nada.
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

# Fotos da personalização (/uploads) — 24/09/2026, 2ª queda.
# Causa: o bind ./backend/uploads dessincroniza ao recriar o container
# (deploy com --build, WSL/reboot) — o container enxerga a pasta vazia e o
# site dá 404, com arquivos e banco intactos. Cura: restart re-monta o bind.
# Só reinicia se o arquivo EXISTE no disco (bind dessincronizado); se o
# arquivo sumiu do disco, apenas registra — restart não adiantaria, precisa
# restaurar do Drive (G:\Meu Drive\Natan\Backup Sistema\uploads).
try {
  $logDir = Join-Path $env:ProgramData 'MIPs\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $wlog = Join-Path $logDir 'watchdog.log'
  $portal = Invoke-RestMethod 'http://localhost:7001/api/configuracoes-portal' -TimeoutSec 15
  $urls = @($portal.logo_site, $portal.logo_avaliacao, $portal.imagem_login, $portal.ajuda_icone, $portal.imagem_dashboard) |
    Where-Object { $_ -like '/uploads/*' } | Select-Object -Unique
  $uploadsDir = 'C:\Users\Marcelo\Projetos\Sistema-MIPs\backend\uploads'
  foreach ($u in $urls) {
    $ok = $false
    try {
      $r = Invoke-WebRequest ('http://localhost:7001' + $u) -Method Head -TimeoutSec 15 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ok = $true }
    } catch {}
    if ($ok) { continue }
    $nome = Split-Path $u -Leaf
    if (Test-Path (Join-Path $uploadsDir $nome)) {
      & $dockerExe compose -f $composeFile restart backend 2>$null | Out-Null
      "$(Get-Date -Format s) WATCHDOG uploads: $u existe no disco mas dá 404 no site (bind dessincronizado) — backend reiniciado" | Out-File -Append $wlog
    } else {
      "$(Get-Date -Format s) WATCHDOG uploads: ARQUIVO AUSENTE no disco: $nome — restaurar de G:\Meu Drive\Natan\Backup Sistema\uploads" | Out-File -Append $wlog
    }
    break  # um restart por execução basta; a próxima rodada (5 min) reavalia
  }
} catch {}
