@echo off
:: MIPs-Espelho-Drive -> launcher oculto (sem flash). Exige admin UMA vez (UAC).
:: Clique duplo, confirme o UAC e pronto. Criado em 05/10/2026.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0fix-espelho-oculto.ps1\"'"
