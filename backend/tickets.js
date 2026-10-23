// Regras puras de tickets/chat — Fase 2 (sem dependência de banco).
const CATEGORIAS_TICKET = ['ASO', 'Folga', 'Dúvida', 'Documento', 'Banco de Horas', 'Outro'];
// Status enxutos (23/10/2026): Atendendo = na fila/responsabilidade do RH,
// Pendente = aguardando retorno do funcionário, Concluído = arquivado no histórico.
const STATUS_TICKET = ['Atendendo', 'Pendente', 'Concluído'];
const STATUS_TICKET_ENCERRADOS = ['Concluído'];
const PRIORIDADES_TICKET = ['Baixa', 'Média', 'Alta', 'Urgente'];
const SLA_HORAS = { Baixa: 120, Média: 72, Alta: 24, Urgente: 4 };

function numeroTicket(seq, ano) {
  return `TK-${ano}-${String(seq).padStart(4, '0')}`;
}

function prazoSLA(prioridade, base = Date.now()) {
  const horas = SLA_HORAS[prioridade] ?? SLA_HORAS.Média;
  return new Date(base + horas * 3600 * 1000);
}

// Status depois de uma mensagem: resposta do RH deixa o ticket aguardando o
// funcionário (Pendente); mensagem do funcionário devolve para o RH (Atendendo).
function statusAposMensagem(statusAtual, autorEhRH) {
  if (autorEhRH) return statusAtual === 'Concluído' ? 'Atendendo' : 'Pendente';
  return 'Atendendo';
}

function ticketEncerrado(status) {
  return STATUS_TICKET_ENCERRADOS.includes(status);
}

module.exports = {
  CATEGORIAS_TICKET, STATUS_TICKET, STATUS_TICKET_ENCERRADOS, PRIORIDADES_TICKET,
  SLA_HORAS, numeroTicket, prazoSLA, statusAposMensagem, ticketEncerrado,
};
