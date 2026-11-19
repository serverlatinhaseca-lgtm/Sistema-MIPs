# Extrai pedidos (PDF/XLS/XLSX/CSV) em texto de tabela. Roda no Windows (OpenCode desktop),
# sem WSL: usa o extrair.py dentro de um container Docker (imagem mips-extrair, construída
# sozinha na 1ª vez ou quando o extrair.py/Dockerfile mudar).
# Uso: powershell -NoProfile -File scripts/etiquetas/extrair.ps1 "D:\Usuário\Downloads\PED 35.2026.pdf" "D:\...\planilha.xls"
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arquivos)
# 'Continue': no PowerShell 5.1 o stderr do docker vira erro fatal com 'Stop'; checamos $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if (-not $Arquivos) { Write-Output 'Informe um ou mais arquivos.'; exit 1 }

# Versão da imagem = hash do extrair.py + Dockerfile (reconstrói só quando mudam)
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath "$PSScriptRoot\extrair.py").Hash.Substring(0, 8) +
        (Get-FileHash -Algorithm SHA256 -LiteralPath "$PSScriptRoot\Dockerfile").Hash.Substring(0, 4)
$imagem = "mips-extrair:$($hash.ToLower())"
cmd /c "docker image inspect $imagem >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
  Write-Output "Preparando o extrator (só na 1ª vez, ~1 min)..."
  cmd /c "docker build -q -t $imagem `"$PSScriptRoot`" >nul 2>nul"
  if ($LASTEXITCODE -ne 0) { Write-Output 'ERRO: não consegui construir a imagem do extrator (Docker está rodando?).'; exit 1 }
}

# Copia os arquivos para uma pasta temporária (evita problema com acento/espaço no caminho)
$tmp = Join-Path $env:TEMP ("mips-extrair-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
  $nomes = @()
  foreach ($a in $Arquivos) {
    if (-not (Test-Path -LiteralPath $a)) { Write-Output "ERRO: arquivo não encontrado: $a"; continue }
    $item = Get-Item -LiteralPath $a
    Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $tmp $item.Name)
    $nomes += $item.Name
  }
  if (-not $nomes) { exit 1 }
  docker run --rm -e PYTHONIOENCODING=utf-8 -v "${tmp}:/in:ro" $imagem @nomes
  exit $LASTEXITCODE
} finally {
  Remove-Item -Recurse -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
}
