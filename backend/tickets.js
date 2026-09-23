// Regras puras de tickets/chat — Fase 2 (sem dependência de banco).
const CATEGORIAS_TICKET = ['ASO', 'Folga', 'Dúvida', 'Documento', 'Banco de Horas', 'Outro'];
const STATUS_TICKET = ['Aberto', 'Em andamento', 'Aguardando funcionário', 'Resolvido', 'Fechado'];
const PRIORIDADES_TICKET = ['Baixa', 'Média', 'Alta', 'Urgente'];
const SLA_HORAS = { Baixa: 120, Média: 72, Alta: 24, Urgente: 4 };

function numeroTicket(seq, ano) {
  return `TK-${ano}-${String(seq).padStart(4, '0')}`;
}

function prazoSLA(prioridade, base = Date.now()) {
  const horas = SLA_HORAS[prioridade] ?? SLA_HORAS.Média;
  return new Date(base + horas * 3600 * 1000);
}

module.exports = { CATEGORIAS_TICKET, STATUS_TICKET, PRIORIDADES_TICKET, SLA_HORAS, numeroTicket, prazoSLA };
