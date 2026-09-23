# Sessão 2026-09-23 (parte 3) — Locais→Config, Banco de Horas + Folgas (v2.10.0)

## Mudanças pedidas pelo mantenedor
- **Locais de Exame agora em Central de configurações** (nova aba "Locais de Exame" + atalho na pasta Configuração da sidebar). Página `/locais-exame`, rota e item antigo removidos. Efeito colateral: virou **só Administrador** (a Central barra gerente); antes gerente tinha acesso. Se gerente precisar, reabrir.
- **Módulo 8 (Agendamentos Gerais) descartado** — não será feito.

## Banco de Horas
- `usuarios.matricula` + `usuarios.cpf` (migration + GET/POST/PUT + campos no modal de Usuários — RH preenche para o match funcionar).
- Tabelas `banco_horas_lotes` / `banco_horas`. Fluxo: lote por competência (rascunho) → upload PDFs + XLSX mapeamento (Matrícula,Nome,CPF,Arquivo,Competência) + ZIP (matrícula no nome) → revisão ✅⚠️❌ → publicar (só com PDF; notifica vinculados). Upload individual publica direto. Trava anti-troca: 1 PDF = 1 registro com 1 `usuario_id`.
- Dep nova `adm-zip`. OCR do rodapé **não feito** (sem infra de OCR; match é matrícula→nome).
- Tela `/banco-horas` (RH + Meu Banco de Horas com filtro AAAA-MM).

## Folgas
- Regras puras `backend/folgas.js` + 6 testes (5x2, 6x1, 12x36, 4x2, Revezamento A/B/C/D, Personalizado).
- Tabelas `escalas` / `folgas` (UNIQUE usuario+data = trava de conflito, 409 com aviso) / `solicitacoes_folga`.
- Escala gera rascunho (só RH vê) → publicar notifica; grade por período; líder (editor) vê só a equipe; funcionário vê Minhas Folgas (PDF/.ics) + solicita (RH aprova/recusa, aprovada vira folga).
- Tela `/folgas`. Sem drag&drop na grade (lista/impressão) — ficou como evolução opcional.

## Bugs da sessão
1. Três fragmentos duplicados pós-edição quebraram o boot (SyntaxError) — removidos; **lição: rodar `node --check` via `docker run` antes de todo rebuild** (container em crash-loop não aceita exec/cp).
2. `tickets.criado_por` (parte 2) resolvido com ALTER defensivo.

## Verificação
- Health ok; `node --test` **18/18**; 5 tabelas novas no banco; bundle com banco-horas/folgas/locais-na-config.
- Fluxos reais via token de teste: lote→ZIP com matrícula→vinculou Eduarda→publicou→"meus" ok; escala 5x2 (4 folgas, 0 conflitos)→publicar (2 avisados)→conflito 409→solicitar→aprovar. **Tudo apagado depois** (folgas/escalas/BH 0; matrícula de teste revertida; PDFs de teste removidos de uploads/).
- Pendente: e-mail/push/WhatsApp, OCR, drag&drop na grade, LGPD repouso.
