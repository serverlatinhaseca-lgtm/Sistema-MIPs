const test = require('node:test');
const assert = require('node:assert/strict');
const { classificarFaixa, calcularASO, excelSerialToISO, normalizarFaixaPlanilha } = require('./aso');

// Regra do prompt: Vermelho ≤21% · Laranja ≤40% · Amarelo ≤67% · Verde >67%.
test('faixas seguem os limites do prompt', () => {
  assert.equal(classificarFaixa(0.21), 'Vermelho');
  assert.equal(classificarFaixa(0.22), 'Laranja');
  assert.equal(classificarFaixa(0.40), 'Laranja');
  assert.equal(classificarFaixa(0.41), 'Amarelo');
  assert.equal(classificarFaixa(0.67), 'Amarelo');
  assert.equal(classificarFaixa(0.68), 'Verde');
  assert.equal(classificarFaixa(0), 'Vermelho');
  assert.equal(classificarFaixa(-0.05), 'Vermelho');
});

// Caso real da planilha: Adeir — último 2025-10-06, vencimento 2026-10-06.
test('calcula dias e faixa do exemplo Adeir', () => {
  const r = calcularASO('2025-10-06', '2026-10-06', '2026-09-08');
  assert.equal(r.diasPeriodo, 365);
  assert.equal(r.diasRestantes, 28);
  assert.ok(Math.abs(r.percentualRestante - 28 / 365) < 1e-9);
  assert.equal(r.faixa, 'Vermelho');
  assert.equal(r.vencido, false);
});

test('sem último exame vira pendente', () => {
  const r = calcularASO(null, null, '2026-09-23');
  assert.equal(r.faixa, 'Pendente');
  assert.equal(r.pendente, true);
});

test('vencido tem dias negativos e faixa vermelha', () => {
  const r = calcularASO('2025-08-23', '2026-08-23', '2026-09-09');
  assert.ok(r.diasRestantes < 0);
  assert.equal(r.faixa, 'Vermelho');
  assert.equal(r.vencido, true);
});

test('converte serial Excel em ISO', () => {
  assert.equal(excelSerialToISO(46283), '2026-09-18');
  assert.equal(excelSerialToISO(null), null);
});

test('normaliza faixa da planilha (inclui divergentes)', () => {
  assert.equal(normalizarFaixaPlanilha('Vermelho'), 'Vermelho');
  assert.equal(normalizarFaixaPlanilha('verde'), 'Verde');
  assert.equal(normalizarFaixaPlanilha(''), 'Pendente');
});
