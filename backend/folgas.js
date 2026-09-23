// Regras puras de folgas/escalas (sem dependência de banco).
const MODELOS = ['5x2', '6x1', '12x36', '4x2', 'Revezamento', 'Personalizado'];
const TIPOS_FOLGA = ['Fixa Semanal', 'Rotativa', '12x36', '5x2', '6x1', 'Revezamento', 'Compensatória', 'Pontual', 'Feriado', 'Licença', 'Banco de Horas'];
const TIMES = ['A', 'B', 'C', 'D'];

function isoDe(date) { return date.toISOString().slice(0, 10); }
function somarDiasISO(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDe(d);
}
function diasEntre(inicioISO, fimISO) {
  const a = new Date(`${inicioISO}T12:00:00Z`).getTime();
  const b = new Date(`${fimISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// Gera as datas de folga de um ciclo. Retorna array de 'YYYY-MM-DD'.
// personalizado: diasSemana = [0..6] fixos; revezamento: time 'A'..'D'.
function gerarFolgasCiclo(modelo, inicioISO, fimISO, { diasSemana = [], time = 'A' } = {}) {
  const total = diasEntre(inicioISO, fimISO);
  if (total < 0 || total > 370) throw new Error('Período inválido (máx. 370 dias).');
  const idxTime = Math.max(0, TIMES.indexOf(time));
  const out = [];
  for (let i = 0; i <= total; i++) {
    const data = somarDiasISO(inicioISO, i);
    const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
    let folga = false;
    if (modelo === '5x2') folga = dow === 0 || dow === 6;
    else if (modelo === '6x1') folga = i % 7 === 6;
    else if (modelo === '12x36') folga = i % 2 === 1;
    else if (modelo === '4x2') folga = i % 6 >= 4;
    else if (modelo === 'Revezamento') folga = (i + idxTime) % 4 === 3;
    else if (modelo === 'Personalizado') folga = diasSemana.includes(dow);
    if (folga) out.push(data);
  }
  return out;
}

module.exports = { MODELOS, TIPOS_FOLGA, TIMES, gerarFolgasCiclo, somarDiasISO, diasEntre };
