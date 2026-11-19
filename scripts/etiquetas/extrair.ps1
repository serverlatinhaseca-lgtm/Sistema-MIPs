# Extrai pedidos (PDF/XLS/XLSX/CSV) em texto de tabela, rodando o extrair.py no WSL.
# Uso: powershell -NoProfile -File scripts/etiquetas/extrair.ps1 "D:\Usuário\Downloads\PED 35.2026.pdf" "D:\...\planilha.xls"
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arquivos)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if (-not $Arquivos) { Write-Output 'Informe um ou mais arquivos.'; exit 1 }
$script = (wsl -e wslpath -a ($PSScriptRoot + '\extrair.py')).Trim()
$caminhos = foreach ($a in $Arquivos) {
  $completo = (Resolve-Path -LiteralPath $a).Path
  (wsl -e wslpath -a $completo).Trim()
}
wsl -e python3 $script @caminhos
