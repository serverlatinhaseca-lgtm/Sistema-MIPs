' run-hidden.vbs — executor oculto para as tarefas agendadas do MIPs.
' Uso na tarefa:  wscript.exe "<repo>\scripts\run-hidden.vbs" "<script.ps1>" //B //Nologo
' Por que: powershell.exe é um app de console; mesmo com "-WindowStyle Hidden",
' o Agendador (logon interativo) aloca uma janela que PISCA a cada execução
' (no watchdog, a cada 5 min). Via WScript.Shell.Run com estilo 0 não há
' console nenhum — zero flash — e o True faz o wscript aguardar o fim.
If WScript.Arguments.Count = 0 Then WScript.Quit 2
Dim sh, cmd, i
Set sh = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " """ & WScript.Arguments(i) & """"
Next
sh.Run cmd, 0, True
