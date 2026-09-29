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

# Fotos da personalização (/uploads) — 29/09/2026, correção definitiva (3ª queda).
# Antes (bind ./backend/uploads): o bind WSL dessincronizava ao recriar o
# container e o site dava 404 com arquivos intactos no host — cura era restart.
# Agora (volume nomeado uploads_data): desync de bind não existe mais; se der
# 404, é ausência real no volume ou backend fora do ar — só registra, e o
# diagnóstico no boot (backend/index.js) aponta a contagem no volume.
# Não usa mais Test-Path no host: backend\uploads é legado (semente da migração).
try {
  $logDir = Join-Path $env:ProgramData 'MIPs\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $wlog = Join-Path $logDir 'watchdog.log'
  $portal = Invoke-RestMethod 'http://localhost:7001/api/configuracoes-portal' -TimeoutSec 15
  $urls = @($portal.logo_site, $portal.logo_avaliacao, $portal.imagem_login, $portal.ajuda_icone, $portal.imagem_dashboard) |
    Where-Object { $_ -like '/uploads/*' } | Select-Object -Unique
  foreach ($u in $urls) {
    $ok = $false
    try {
      $r = Invoke-WebRequest ('http://localhost:7001' + $u) -Method Head -TimeoutSec 15 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ok = $true }
    } catch {}
    if ($ok) { continue }
    # Sem auto-restart: com volume nomeado o 404 indica ausência real no volume
    # (restaurar do tar em G:\Meu Drive\Natan\Backup Sistema\backups\uploads-*.tar.gz)
    # ou backend fora do ar (coberto pelo bloco de containers parados acima).
    $nome = Split-Path $u -Leaf
    "$(Get-Date -Format s) WATCHDOG uploads: $u com 404 no site (volume uploads_data) — verificar backend e restaurar do Drive se preciso" | Out-File -Append $wlog
    break  # um registro por execução basta; a próxima rodada (5 min) reavalia
  }
} catch {}
