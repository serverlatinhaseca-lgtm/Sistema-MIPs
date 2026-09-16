# Espelha backups do banco e uploads para o Google Drive deste PC.
# Agendado diariamente às 03:00 (após o dump das 02:30 do container).
$ErrorActionPreference = 'Stop'
$base   = 'C:\Users\Marcelo\Projetos\Sistema-MIPs'
$dest   = 'G:\Meu Drive\Natan\Backup Sistema'
if (-not (Test-Path $dest)) { throw "Destino inacessível (Drive montado?): $dest" }
$srcBackups = Join-Path $base 'backups'
$srcUploads = Join-Path $base 'backend\uploads'
if (-not (Test-Path $srcBackups)) { throw "Origem inexistente: $srcBackups" }
$logdir = Join-Path $dest 'logs'
$log = Join-Path $logdir ("espelho-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'backups'), (Join-Path $dest 'uploads'), $logdir | Out-Null
function Invoke-Mirror($origem, $destino, [string[]]$extraArgs) {
  $arquivos = @(Get-ChildItem -Path $origem -File -ErrorAction SilentlyContinue)
  if ($arquivos.Count -eq 0) {
    "AVISO: origem vazia, espelho ignorado para proteger o destino: $origem" | Out-File -Append $log
    return $true
  }
  robocopy $origem $destino @extraArgs /MIR /R:2 /W:5 /NP /LOG+:$log | Out-Null
  # robocopy: 0-7 = sucesso (1-7 = diferenças copiadas), >= 8 = falha.
  if ($LASTEXITCODE -ge 8) {
    "FALHA robocopy ($LASTEXITCODE): $origem -> $destino" | Out-File -Append $log
    return $false
  }
  return $true
}
'=== backups ===' | Out-File $log
$okBackups = Invoke-Mirror $srcBackups (Join-Path $dest 'backups') @('mips-*.dump')
'=== uploads ===' | Out-File -Append $log
$okUploads = if (Test-Path $srcUploads) { Invoke-Mirror $srcUploads (Join-Path $dest 'uploads') @('/XF', 'desktop.ini') } else { "AVISO: pasta de uploads inexistente: $srcUploads" | Out-File -Append $log; $false }
if ($okBackups -and $okUploads) { "OK $(Get-Date -Format s)" | Out-File -Append $log } else { throw "Espelho concluído com falhas — ver $log" }
