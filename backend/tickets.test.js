const test = require('node:test');
const assert = require('node:assert/strict');
const { numeroTicket, prazoSLA, SLA_HORAS, CATEGORIAS_TICKET, STATUS_TICKET, statusAposMensagem, ticketEncerrado } = require('./tickets');

test('numera tickets no formato TK-AAAA-NNNN', () => {
  assert.equal(numeroTicket(1, 2026), 'TK-2026-0001');
  assert.equal(numeroTicket(123, 2026), 'TK-2026-0123');
});

test('SLA por prioridade (Urgente 4h … Baixa 120h)', () => {
  assert.equal(SLA_HORAS.Urgente, 4);
  assert.equal(SLA_HORAS.Alta, 24);
  assert.equal(SLA_HORAS.Média, 72);
  assert.equal(SLA_HORAS.Baixa, 120);
  const base = new Date('2026-09-23T10:00:00Z').getTime();
  assert.equal(prazoSLA('Urgente', base).toISOString(), '2026-09-23T14:00:00.000Z');
});

test('categorias e status do prompt', () => {
  assert.deepEqual(CATEGORIAS_TICKET, ['ASO', 'Folga', 'Dúvida', 'Documento', 'Banco de Horas', 'Outro']);
  assert.deepEqual(STATUS_TICKET, ['Atendendo', 'Pendente', 'Concluído']);
});

test('status depois da mensagem: RH deixa Pendente, funcionário devolve Atendendo', () => {
  assert.equal(statusAposMensagem('Atendendo', true), 'Pendente');
  assert.equal(statusAposMensagem('Pendente', true), 'Pendente');
  assert.equal(statusAposMensagem('Atendendo', false), 'Atendendo');
  assert.equal(statusAposMensagem('Pendente', false), 'Atendendo');
  assert.equal(statusAposMensagem('Concluído', false), 'Atendendo');
});

test('ticket concluído reabre quando o RH responde', () => {
  assert.equal(statusAposMensagem('Concluído', true), 'Atendendo');
  assert.equal(ticketEncerrado('Concluído'), true);
  assert.equal(ticketEncerrado('Atendendo'), false);
  assert.equal(ticketEncerrado('Pendente'), false);
});
