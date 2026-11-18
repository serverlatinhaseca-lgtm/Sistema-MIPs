const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fermento');

const base = { farinhaKg: 50, tempMassaC: 20, tempAmbienteC: 24, horas: 8 };

test('condição da base devolve a dose da base (175 g / 50 kg)', () => {
  const r = F.calcularFermento(base);
  assert.equal(r.secoG, 175);
  assert.equal(r.frescoG, 525);
  assert.equal(r.pct, 0.35);
  assert.equal(r.fatorSobreBase, 1);
  assert.equal(r.avisos.length, 0);
});

test('proporcional à farinha', () => {
  assert.equal(F.calcularFermento({ ...base, farinhaKg: 25 }).secoG, 88);
  assert.equal(F.calcularFermento({ ...base, farinhaKg: 100 }).secoG, 350);
});

test('menos tempo pede mais fermento; mais tempo pede menos', () => {
  const curto = F.calcularFermento({ ...base, horas: 5 }).secoG;
  const longo = F.calcularFermento({ ...base, horas: 10 }).secoG;
  assert.ok(curto > 175 && curto < 350, `curto=${curto}`);
  assert.ok(longo < 175 && longo > 100, `longo=${longo}`);
});

test('ambiente quente pede menos fermento; frio pede mais', () => {
  const quente = F.calcularFermento({ ...base, tempAmbienteC: 30 }).secoG;
  const frio = F.calcularFermento({ ...base, tempAmbienteC: 18 }).secoG;
  assert.ok(quente < 175, `quente=${quente}`);
  assert.ok(frio > 175, `frio=${frio}`);
});

test('massa saindo mais quente pede menos fermento', () => {
  assert.ok(F.calcularFermento({ ...base, tempMassaC: 26 }).secoG < 175);
});

test('horário passando da meia-noite', () => {
  assert.equal(F.horasEntre('22:00', '06:00'), 8);
  assert.equal(F.horasEntre('01:30', '05:00'), 3.5);
  assert.ok(Number.isNaN(F.horasEntre('25:00', '05:00')));
  assert.equal(F.calcularFermento({ farinhaKg: 50, tempMassaC: 20, tempAmbienteC: 24, inicio: '22:00', forno: '06:00' }).secoG, 175);
});

test('previsão de horas com a dose padrão é o inverso do cálculo', () => {
  const r = F.calcularFermento(base);
  assert.equal(r.dosePadrao.horas, 8);
  const h = F.preverHoras(0.35, 20, 30, F.normalizarConfig());
  assert.ok(h < 8);
});

test('avisa quando sai dos limites', () => {
  const muito = F.calcularFermento({ ...base, horas: 1, tempAmbienteC: 16 });
  assert.ok(muito.avisos.some((a) => a.nivel === 'alerta'));
  const pouco = F.calcularFermento({ ...base, horas: 20, tempAmbienteC: 34, tempMassaC: 28 });
  assert.ok(pouco.avisos.some((a) => a.nivel === 'alerta'));
});

test('entrada inválida gera erro claro', () => {
  assert.throws(() => F.calcularFermento({ ...base, farinhaKg: 0 }), /farinha/);
  assert.throws(() => F.calcularFermento({ ...base, horas: 0.2 }), /tempo/);
});

test('config: normaliza valores ruins e valida ao salvar', () => {
  const cfg = F.normalizarConfig({ grausParaDobrar: 999, base: { fermentoSecoG: 200 } });
  assert.equal(cfg.grausParaDobrar, F.PADRAO.grausParaDobrar);
  assert.equal(cfg.base.fermentoSecoG, 200);
  assert.throws(() => F.validarConfig({ ...F.PADRAO, atritoC: 50 }), /masseira/);
  assert.throws(() => F.validarConfig({ ...F.PADRAO, minPct: 0.8, maxPct: 0.5 }), /mínimo/);
  assert.equal(F.validarConfig({ ...F.PADRAO, base: { ...F.PADRAO.base, fermentoSecoG: 150 } }).base.fermentoSecoG, 150);
});

test('nova base desloca todas as doses', () => {
  const cfg = { base: { farinhaKg: 50, fermentoSecoG: 200, tempMassaC: 20, tempAmbienteC: 24, horas: 8 } };
  assert.equal(F.calcularFermento(base, cfg).secoG, 200);
});

test('água e gelo pela conta de 3 fatores', () => {
  // 3×20 − 24 − 24 − 12 = 0 °C → precisa de gelo
  const r = F.calcularAgua({ farinhaKg: 50, tempMassaC: 20, tempFarinhaC: 24, tempAmbienteC: 24, tempTorneiraC: 22 });
  assert.equal(r.tempAguaC, 0);
  assert.equal(r.aguaTotalKg, 30);
  assert.equal(r.geloKg, 6.5); // 30 × 22 / 102
  assert.equal(r.aguaKg, 23.5);
  const morna = F.calcularAgua({ farinhaKg: 50, tempMassaC: 26, tempFarinhaC: 15, tempAmbienteC: 15, tempTorneiraC: 18, atritoC: 10 });
  assert.equal(morna.geloKg, 0);
  assert.ok(morna.avisos.length > 0);
  assert.equal(F.descobrirAtrito({ tempMassaC: 20, tempFarinhaC: 24, tempAmbienteC: 24, tempAguaC: 0 }), 12);
});

test('tabela de referência: célula da base bate com 175 g', () => {
  const t = F.tabelaReferencia({ farinhaKg: 50, tempMassaC: 20 });
  const linha = t.linhas.find((l) => l.tempAmbienteC === 24);
  assert.equal(linha.valores[t.horas.indexOf(8)].secoG, 175);
  // cresce para a esquerda (menos tempo) e para cima (mais frio)
  assert.ok(linha.valores[0].secoG > linha.valores[linha.valores.length - 1].secoG);
  assert.ok(t.linhas[0].valores[4].secoG > t.linhas[t.linhas.length - 1].valores[4].secoG);
});
