# Confere (padrão) ou grava (-Aplicar) pedidos de etiquetas no banco.
# Uso:
#   powershell -NoProfile -File scripts/etiquetas/lancar.ps1 backups/pedidos-igarata-23a27nov.json
#   powershell -NoProfile -File scripts/etiquetas/lancar.ps1 backups/pedidos-igarata-23a27nov.json -Aplicar
# Opções: -AceitarNovos (local não cadastrado), -PermitirDuplicado
# Com -Aplicar o backup do estado anterior vai para backups/etiquetas-pre-<rotulo>-<data>.json
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Arquivo,
  [switch]$Aplicar,
  [switch]$AceitarNovos,
  [switch]$PermitirDuplicado
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$container = 'portal_mips_backend'
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$entrada = (Resolve-Path -LiteralPath $Arquivo).Path

$rotulo = 'lancamento'
try {
  $json = Get-Content -LiteralPath $entrada -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($json.rotulo) { $rotulo = ($json.rotulo -replace '[^\w\-]', '-') }
} catch {
  Write-Output "ERRO: $Arquivo não é um JSON válido: $($_.Exception.Message)"
  exit 2
}

docker cp "$PSScriptRoot\lancar.js" "${container}:/app/_lancar_etiquetas.js" | Out-Null
docker cp $entrada "${container}:/tmp/pedidos-etiquetas.json" | Out-Null
$opcoes = @()
if ($Aplicar) { $opcoes += '--aplicar' }
if ($AceitarNovos) { $opcoes += '--aceitar-novos' }
if ($PermitirDuplicado) { $opcoes += '--permitir-duplicado' }

docker exec $container rm -f /tmp/etiquetas-backup.json | Out-Null
docker exec $container node /app/_lancar_etiquetas.js /tmp/pedidos-etiquetas.json @opcoes
$codigo = $LASTEXITCODE
docker exec $container rm -f /app/_lancar_etiquetas.js | Out-Null

if ($Aplicar -and $codigo -eq 0) {
  $pasta = Join-Path $raiz 'backups'
  New-Item -ItemType Directory -Force $pasta | Out-Null
  $destino = Join-Path $pasta ("etiquetas-pre-$rotulo-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.json')
  docker cp "${container}:/tmp/etiquetas-backup.json" $destino | Out-Null
  Write-Output "Backup do estado anterior: $destino"
}
exit $codigo
