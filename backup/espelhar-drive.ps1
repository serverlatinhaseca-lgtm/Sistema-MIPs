# Espelha backups do banco e uploads para o Google Drive deste PC.
# Tarefa agendada 'MIPs-Espelho-Drive', diaria as 03:00 (apos o dump das 02:30 do container).
$ErrorActionPreference = 'Stop'
$base   = 'C:\Users\Marcelo\Projetos\Sistema-MIPs'
$dest   = 'G:\Meu Drive\Natan\Backup Sistema'
$logdirLocal = Join-Path $env:ProgramData 'MIPs\logs'
New-Item -ItemType Directory -Force -Path $logdirLocal | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logLocal = Join-Path $logdirLocal "espelho-$stamp.log"
$rbLog = Join-Path $logdirLocal "espelho-$stamp.robocopy.log"
function Write-Log([string]$msg) {
  "$(Get-Date -Format s) $msg" | Out-File -Append -Encoding utf8 $logLocal
  Write-Host $msg
}
Write-Log '=== inicio ==='

# As 03:00 o Drive pode ainda estar montando: aguarda ate 30 min em vez de falhar de cara.
$limite = (Get-Date).AddMinutes(30)
while (-not (Test-Path $dest)) {
  if ((Get-Date) -gt $limite) {
    Write-Log "FALHA: destino inacessivel apos 30 min: $dest"
    throw "Destino inacessivel (Drive montado?): $dest"
  }
  Write-Log "Aguardando Drive montar: $dest"
  Start-Sleep -Seconds 60
}

$srcBackups = Join-Path $base 'backups'
# 29/09/2026 (correção definitiva, 3ª queda): uploads vivem no volume nomeado
# uploads_data — o container de backup gera uploads-AAAAmmdd-HHMMSS.tar.gz ao
# lado dos dumps, e o filtro abaixo já os leva para Drive\backups.
# backend\uploads é legado (semente da migração); espelha se ainda tiver arquivos.
$srcUploadsLegado = Join-Path $base 'backend\uploads'
if (-not (Test-Path $srcBackups)) { throw "Origem inexistente: $srcBackups" }
$logdirDrive = Join-Path $dest 'logs'
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'backups'), (Join-Path $dest 'uploads'), $logdirDrive | Out-Null
function Invoke-Mirror($origem, $destino, [string[]]$filtros) {
  $arquivos = @(Get-ChildItem -Path $origem -File -ErrorAction SilentlyContinue)
  if ($arquivos.Count -eq 0) {
    Write-Log "AVISO: origem vazia, espelho ignorado para proteger o destino: $origem"
    return $true
  }
  # Log detalhado do robocopy vai para arquivo separado (evita misturar encodings no log principal).
  robocopy $origem $destino @filtros /MIR /R:2 /W:5 /NP /LOG+:$rbLog | Out-Null
  # robocopy: 0-7 = sucesso (1-7 = diferencas copiadas), >= 8 = falha.
  if ($LASTEXITCODE -ge 8) {
    Write-Log "FALHA robocopy ($LASTEXITCODE): $origem -> $destino (detalhes em $rbLog)"
    return $false
  }
  Write-Log "OK: $origem -> $destino (robocopy exit $LASTEXITCODE)"
  return $true
}
Write-Log '=== backups (dumps + uploads-*.tar.gz do volume) ==='
$okBackups = Invoke-Mirror $srcBackups (Join-Path $dest 'backups') @('mips-*.dump', 'uploads-*.tar.gz')
Write-Log '=== uploads legado (backend\uploads, semente da migração) ==='
$okUploads = if ((Test-Path $srcUploadsLegado) -and @(Get-ChildItem -Path $srcUploadsLegado -File -ErrorAction SilentlyContinue).Count) { Invoke-Mirror $srcUploadsLegado (Join-Path $dest 'uploads') @('/XF', 'desktop.ini') } else { Write-Log 'Origem legada vazia/inexistente — uploads oficiais estão nos uploads-*.tar.gz em Drive\backups'; $true }
if ($okBackups -and $okUploads) { Write-Log 'OK fim' } else { throw "Espelho concluido com falhas - ver $logLocal" }
# Copia os logs desta execucao para o Drive e limpa logs locais com mais de 30 dias.
Copy-Item $logLocal, $rbLog $logdirDrive -ErrorAction SilentlyContinue
Get-ChildItem $logdirLocal -File 'espelho-*' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction SilentlyContinue
