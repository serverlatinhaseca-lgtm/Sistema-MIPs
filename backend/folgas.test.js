const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarFolgasCiclo } = require('./folgas');

test('5x2 folga sábado e domingo', () => {
  // 2026-09-23 é quarta; período de 7 dias a partir de uma segunda.
  const r = gerarFolgasCiclo('5x2', '2026-09-21', '2026-09-27');
  assert.deepEqual(r, ['2026-09-26', '2026-09-27']);
});

test('6x1 folga a cada 7 dias', () => {
  const r = gerarFolgasCiclo('6x1', '2026-09-21', '2026-10-04');
  assert.deepEqual(r, ['2026-09-27', '2026-10-04']);
});

test('12x36 alterna os dias', () => {
  const r = gerarFolgasCiclo('12x36', '2026-09-21', '2026-09-24');
  assert.deepEqual(r, ['2026-09-22', '2026-09-24']);
});

test('4x2 descansa 2 a cada 6', () => {
  const r = gerarFolgasCiclo('4x2', '2026-09-21', '2026-09-26');
  assert.deepEqual(r, ['2026-09-25', '2026-09-26']);
});

test('revezamento alterna entre os 4 times', () => {
  const a = gerarFolgasCiclo('Revezamento', '2026-09-21', '2026-09-24', { time: 'A' });
  const b = gerarFolgasCiclo('Revezamento', '2026-09-21', '2026-09-24', { time: 'B' });
  assert.deepEqual(a, ['2026-09-24']);
  assert.deepEqual(b, ['2026-09-23']);
});

test('personalizado usa os dias da semana', () => {
  const r = gerarFolgasCiclo('Personalizado', '2026-09-21', '2026-09-27', { diasSemana: [3] });
  assert.deepEqual(r, ['2026-09-23']);
});
