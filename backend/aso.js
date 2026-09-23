// Regras puras do módulo ASO — Fase 1 (sem dependência de banco).
// Decisão 23/09/2026: a importação preserva a faixa da planilha (faixa_importada);
// novos cálculos e o job diário usam a regra do prompt:
//   Vermelho ≤21% · Laranja ≤40% · Amarelo ≤67% · Verde >67%.

function excelSerialToISO(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function diasEntre(aISO, bISO) {
  const a = new Date(`${aISO}T12:00:00Z`).getTime();
  const b = new Date(`${bISO}T12:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function hojeISO(data = new Date()) {
  return data.toISOString().slice(0, 10);
}

function classificarFaixa(percentual) {
  if (percentual === null || percentual === undefined || Number.isNaN(Number(percentual))) return 'Pendente';
  const p = Number(percentual);
  if (p <= 0.21) return 'Vermelho';
  if (p <= 0.40) return 'Laranja';
  if (p <= 0.67) return 'Amarelo';
  return 'Verde';
}

// ultimoExameISO / vencimentoISO no formato 'YYYY-MM-DD' (ou null).
// Retorna { diasPeriodo, diasRestantes, percentualRestante, faixa, pendente, vencido }.
function calcularASO(ultimoExameISO, vencimentoISO, hoje = hojeISO()) {
  if (!ultimoExameISO || !vencimentoISO) {
    return { diasPeriodo: null, diasRestantes: null, percentualRestante: null, faixa: 'Pendente', pendente: true, vencido: false };
  }
  const diasPeriodo = diasEntre(ultimoExameISO, vencimentoISO);
  const diasRestantes = diasEntre(hoje, vencimentoISO);
  if (diasPeriodo === null || diasRestantes === null || diasPeriodo <= 0) {
    return { diasPeriodo, diasRestantes, percentualRestante: null, faixa: 'Pendente', pendente: true, vencido: false };
  }
  const percentualRestante = diasRestantes / diasPeriodo;
  const faixa = classificarFaixa(percentualRestante);
  return { diasPeriodo, diasRestantes, percentualRestante, faixa, pendente: false, vencido: diasRestantes < 0 };
}

const FAIXAS_VALIDAS = ['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Pendente'];

function normalizarFaixaPlanilha(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (v.startsWith('verm')) return 'Vermelho';
  if (v.startsWith('lar')) return 'Laranja';
  if (v.startsWith('amar')) return 'Amarelo';
  if (v.startsWith('verd')) return 'Verde';
  return 'Pendente';
}

module.exports = { excelSerialToISO, diasEntre, hojeISO, classificarFaixa, calcularASO, normalizarFaixaPlanilha, FAIXAS_VALIDAS };
