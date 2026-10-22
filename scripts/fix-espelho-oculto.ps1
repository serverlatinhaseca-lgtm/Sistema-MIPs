#Requires -RunAsAdministrator
# Troca a acao da tarefa MIPs-Espelho-Drive para o launcher oculto
# (scripts/run-hidden.vbs) — chamado pelo fix-espelho-oculto.bat (UAC 1x).
$ErrorActionPreference = 'Stop'
$base = 'C:\Users\Marcelo\Projetos\Sistema-MIPs'
$runner = Join-Path $base 'scripts\run-hidden.vbs'
if (-not (Test-Path $runner)) { throw "Launcher inexistente: $runner" }
$ae = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$runner`" `"$base\backup\espelhar-drive.ps1`" //B //Nologo"
Set-ScheduledTask -TaskName 'MIPs-Espelho-Drive' -Action $ae | Out-Null
Write-Output 'OK — MIPs-Espelho-Drive agora usa o launcher oculto:'
(Get-ScheduledTask -TaskName 'MIPs-Espelho-Drive').Actions | Format-List Execute, Arguments
