// Calculadora de fermento (pão francês / massa de sal) — regra pura e testável.
//
// Ideia: o "trabalho" do fermento é proporcional a  quantidade × atividade × tempo.
// A atividade depende da temperatura da massa (dobra a cada `grausParaDobrar` °C).
// Sem estufa, a massa sai da masseira numa temperatura e vai se aproximando da
// temperatura ambiente no carrinho (curva exponencial com constante `tauHoras`).
// Calibramos com a base que funciona na padaria (175 g de seco p/ 50 kg de farinha,
// massa a 20 °C, ~8 h até assar) e, para qualquer outra condição, ajustamos o
// fermento para entregar o mesmo "trabalho" no tempo disponível.

const PADRAO = Object.freeze({
  base: Object.freeze({ farinhaKg: 50, fermentoSecoG: 175, tempMassaC: 20, tempAmbienteC: 24, horas: 8 }),
  grausParaDobrar: 9,   // a cada 9 °C a mais o fermento trabalha 2× mais rápido
  tauHoras: 1.5,        // em ~1,5 h a massa percorre 63% da diferença até o ambiente
  fatorFresco: 3,       // fermento fresco = seco × 3
  minPct: 0.1,          // % de fermento seco sobre a farinha
  maxPct: 1.5,
  hidratacaoPct: 60,    // litros de água por 100 kg de farinha
  atritoC: 12,          // quanto a masseira esquenta a massa (°C)
});

const LIMITES_CONFIG = {
  'base.farinhaKg': [1, 500], 'base.fermentoSecoG': [1, 5000], 'base.tempMassaC': [5, 35],
  'base.tempAmbienteC': [5, 40], 'base.horas': [0.5, 24],
  grausParaDobrar: [5, 15], tauHoras: [0.2, 6], fatorFresco: [2, 4],
  minPct: [0.01, 1], maxPct: [0.3, 3], hidratacaoPct: [40, 80], atritoC: [0, 30],
};

const TEMP_MIN_ATIVIDADE = 2;
const TEMP_MAX_ATIVIDADE = 36; // acima disso o fermento não acelera mais (e começa a sofrer)
const CALOR_LATENTE_GELO = 80; // usado na conta clássica do gelo

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(String(v).replace(',', '.')));
const arred = (v, casas = 1) => { const f = 10 ** casas; return Math.round(v * f + 1e-6) / f; };
const gramas = (v) => Math.round(v + 1e-6); // evita 87,4999 → 87 por ruído de ponto flutuante

function lerCaminho(obj, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Junta o que foi salvo com o padrão; valor ausente/ inválido volta ao padrão.
function normalizarConfig(dados = {}) {
  const cfg = { ...PADRAO, base: { ...PADRAO.base } };
  for (const [caminho, [min, max]] of Object.entries(LIMITES_CONFIG)) {
    const v = num(lerCaminho(dados, caminho));
    if (!Number.isFinite(v) || v < min || v > max) continue;
    if (caminho.startsWith('base.')) cfg.base[caminho.slice(5)] = v; else cfg[caminho] = v;
  }
  if (cfg.minPct >= cfg.maxPct) { cfg.minPct = PADRAO.minPct; cfg.maxPct = PADRAO.maxPct; }
  return cfg;
}

// Validação estrita para salvar (Administrador): devolve a config ou lança erro.
function validarConfig(dados = {}) {
  const nomes = {
    'base.farinhaKg': 'Farinha da base (kg)', 'base.fermentoSecoG': 'Fermento da base (g)',
    'base.tempMassaC': 'Temperatura da massa da base', 'base.tempAmbienteC': 'Temperatura ambiente da base',
    'base.horas': 'Tempo da base (h)', grausParaDobrar: 'Graus para dobrar a velocidade',
    tauHoras: 'Tempo para a massa pegar a temperatura do ambiente', fatorFresco: 'Fator do fermento fresco',
    minPct: 'Mínimo de fermento (%)', maxPct: 'Máximo de fermento (%)', hidratacaoPct: 'Hidratação (%)',
    atritoC: 'Aquecimento da masseira (°C)',
  };
  for (const [caminho, [min, max]] of Object.entries(LIMITES_CONFIG)) {
    const v = num(lerCaminho(dados, caminho));
    if (!Number.isFinite(v) || v < min || v > max) {
      throw new Error(`${nomes[caminho]} deve ficar entre ${String(min).replace('.', ',')} e ${String(max).replace('.', ',')}.`);
    }
  }
  if (num(dados.minPct) >= num(dados.maxPct)) throw new Error('O mínimo de fermento precisa ser menor que o máximo.');
  return normalizarConfig(dados);
}

// "22:00" → "06:00" = 8 h (passa da meia-noite). Mesmo horário = 24 h.
function horasEntre(inicio, fim) {
  const m = (s) => {
    const r = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!r || Number(r[1]) > 23 || Number(r[2]) > 59) return NaN;
    return Number(r[1]) * 60 + Number(r[2]);
  };
  const a = m(inicio); const b = m(fim);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  let d = b - a;
  if (d <= 0) d += 24 * 60;
  return d / 60;
}

function temperaturaMassa(t, tempMassa, tempAmbiente, cfg) {
  return tempAmbiente + (tempMassa - tempAmbiente) * Math.exp(-t / cfg.tauHoras);
}

function velocidade(temp, cfg) {
  const t = Math.min(TEMP_MAX_ATIVIDADE, Math.max(TEMP_MIN_ATIVIDADE, temp));
  return 2 ** ((t - 25) / cfg.grausParaDobrar);
}

// Integral da atividade do fermento ao longo do tempo (passo de 1 minuto, trapézios).
function atividade(tempMassa, tempAmbiente, horas, cfg) {
  if (!(horas > 0)) return 0;
  const passos = Math.max(10, Math.ceil(horas * 60));
  const dt = horas / passos;
  let soma = 0;
  let anterior = velocidade(temperaturaMassa(0, tempMassa, tempAmbiente, cfg), cfg);
  for (let i = 1; i <= passos; i += 1) {
    const atual = velocidade(temperaturaMassa(i * dt, tempMassa, tempAmbiente, cfg), cfg);
    soma += (anterior + atual) / 2 * dt;
    anterior = atual;
  }
  return soma;
}

function pctBase(cfg) {
  return cfg.base.fermentoSecoG / (cfg.base.farinhaKg * 10);
}

function atividadeBase(cfg) {
  return atividade(cfg.base.tempMassaC, cfg.base.tempAmbienteC, cfg.base.horas, cfg);
}

// % de fermento seco sobre a farinha para a condição informada.
function pctNecessario(tempMassa, tempAmbiente, horas, cfg) {
  return pctBase(cfg) * atividadeBase(cfg) / atividade(tempMassa, tempAmbiente, horas, cfg);
}

// Com uma dose fixa (% seco), em quantas horas a massa fica pronta? null se passar de 48 h.
function preverHoras(pct, tempMassa, tempAmbiente, cfg) {
  if (!(pct > 0)) return null;
  const alvo = pctBase(cfg) * atividadeBase(cfg) / pct;
  if (atividade(tempMassa, tempAmbiente, 48, cfg) < alvo) return null;
  let lo = 0; let hi = 48;
  for (let i = 0; i < 40; i += 1) {
    const meio = (lo + hi) / 2;
    if (atividade(tempMassa, tempAmbiente, meio, cfg) < alvo) lo = meio; else hi = meio;
  }
  return hi;
}

// Conta clássica de 3 fatores: água = 3 × massa desejada − farinha − ambiente − atrito.
function temperaturaAgua({ tempMassaC, tempFarinhaC, tempAmbienteC, atritoC }) {
  return 3 * tempMassaC - tempFarinhaC - tempAmbienteC - atritoC;
}

// Descobre o atrito real a partir de uma fornada medida.
function descobrirAtrito({ tempMassaC, tempFarinhaC, tempAmbienteC, tempAguaC }) {
  return 3 * tempMassaC - tempFarinhaC - tempAmbienteC - tempAguaC;
}

// Quanto da água trocar por gelo para chegar na temperatura da água necessária.
function calcularGelo({ aguaTotalKg, tempTorneiraC, tempAguaC }) {
  if (tempAguaC >= tempTorneiraC) return { geloKg: 0, aguaKg: aguaTotalKg, aquecer: tempAguaC > tempTorneiraC + 0.5 };
  const geloKg = aguaTotalKg * (tempTorneiraC - tempAguaC) / (tempTorneiraC + CALOR_LATENTE_GELO);
  return { geloKg, aguaKg: aguaTotalKg - geloKg, aquecer: false };
}

function lerEntrada(entrada = {}) {
  const farinhaKg = num(entrada.farinhaKg);
  const tempMassaC = num(entrada.tempMassaC);
  const tempAmbienteC = num(entrada.tempAmbienteC);
  let horas = num(entrada.horas);
  if (!Number.isFinite(horas) && (entrada.inicio || entrada.forno)) horas = horasEntre(entrada.inicio, entrada.forno);
  if (!Number.isFinite(farinhaKg) || farinhaKg <= 0 || farinhaKg > 2000) throw new Error('Informe a farinha em kg (entre 0 e 2000).');
  if (!Number.isFinite(tempMassaC) || tempMassaC < 0 || tempMassaC > 45) throw new Error('Informe a temperatura da massa (°C).');
  if (!Number.isFinite(tempAmbienteC) || tempAmbienteC < 0 || tempAmbienteC > 45) throw new Error('Informe a temperatura ambiente (°C).');
  if (!Number.isFinite(horas) || horas < 0.5 || horas > 24) throw new Error('O tempo até assar deve ficar entre 30 min e 24 h.');
  return { farinhaKg, tempMassaC, tempAmbienteC, horas };
}

function calcularFermento(entrada, cfgBruta) {
  const cfg = normalizarConfig(cfgBruta);
  const { farinhaKg, tempMassaC, tempAmbienteC, horas } = lerEntrada(entrada);
  const pct = pctNecessario(tempMassaC, tempAmbienteC, horas, cfg);
  const secoG = gramas(pct * farinhaKg * 10);
  const pctFinal = secoG / (farinhaKg * 10);
  const avisos = [];

  if (pct < cfg.minPct) {
    avisos.push({ nivel: 'alerta', texto: `Fermento abaixo de ${String(cfg.minPct).replace('.', ',')}% da farinha: com tão pouco o crescimento fica irregular. Deixe a massa sair mais fria ou encurte o tempo.` });
  }
  if (pct > cfg.maxPct) {
    avisos.push({ nivel: 'alerta', texto: `Fermento acima de ${String(cfg.maxPct).replace('.', ',')}% da farinha: o pão cresce rápido demais e perde sabor e estrutura. Se der, aumente o tempo ou deixe a massa sair mais quente.` });
  }
  if (tempAmbienteC > 32) avisos.push({ nivel: 'atencao', texto: 'Ambiente muito quente: confira o crescimento antes do horário, a massa pode passar do ponto.' });
  if (tempAmbienteC < 14) avisos.push({ nivel: 'atencao', texto: 'Ambiente frio: o crescimento fica lento e mais sensível a correntes de ar. Proteja os carrinhos.' });
  if (tempMassaC < 16 || tempMassaC > 28) avisos.push({ nivel: 'atencao', texto: 'Temperatura da massa fora do normal para pão francês (16 a 28 °C). Confira a água/gelo.' });
  if (horas < 2) avisos.push({ nivel: 'atencao', texto: 'Tempo muito curto: mesmo com mais fermento o pão pode ficar com pouco sabor.' });

  const horasDosePadrao = preverHoras(pctBase(cfg), tempMassaC, tempAmbienteC, cfg);
  return {
    secoG,
    frescoG: gramas(secoG * cfg.fatorFresco),
    pct: arred(pctFinal, 3),
    gPorKg: arred(secoG / farinhaKg, 2),
    horas: arred(horas, 2),
    fatorSobreBase: arred(pct / pctBase(cfg), 2),
    tempMassaNoFornoC: arred(temperaturaMassa(horas, tempMassaC, tempAmbienteC, cfg), 1),
    dosePadrao: {
      secoG: gramas(pctBase(cfg) * farinhaKg * 10),
      horas: horasDosePadrao == null ? null : arred(horasDosePadrao, 1),
    },
    avisos,
  };
}

// Água/gelo para a massa sair na temperatura desejada.
function calcularAgua(entrada, cfgBruta) {
  const cfg = normalizarConfig(cfgBruta);
  const farinhaKg = num(entrada.farinhaKg);
  const tempMassaC = num(entrada.tempMassaC);
  const tempFarinhaC = num(entrada.tempFarinhaC);
  const tempAmbienteC = num(entrada.tempAmbienteC);
  const tempTorneiraC = num(entrada.tempTorneiraC);
  const atritoC = Number.isFinite(num(entrada.atritoC)) ? num(entrada.atritoC) : cfg.atritoC;
  const hidratacaoPct = Number.isFinite(num(entrada.hidratacaoPct)) ? num(entrada.hidratacaoPct) : cfg.hidratacaoPct;
  for (const [v, nome] of [[farinhaKg, 'a farinha (kg)'], [tempMassaC, 'a temperatura da massa'], [tempFarinhaC, 'a temperatura da farinha'], [tempAmbienteC, 'a temperatura ambiente'], [tempTorneiraC, 'a temperatura da água da torneira']]) {
    if (!Number.isFinite(v)) throw new Error(`Informe ${nome}.`);
  }
  const tempAguaC = temperaturaAgua({ tempMassaC, tempFarinhaC, tempAmbienteC, atritoC });
  const aguaTotalKg = farinhaKg * hidratacaoPct / 100;
  const gelo = calcularGelo({ aguaTotalKg, tempTorneiraC, tempAguaC });
  const avisos = [];
  if (gelo.geloKg > aguaTotalKg * 0.6) avisos.push({ nivel: 'alerta', texto: 'Precisaria de gelo demais (mais de 60% da água). Use farinha mais fria, gele a água antes ou aceite uma massa mais quente e recalcule o fermento.' });
  if (gelo.aquecer) avisos.push({ nivel: 'atencao', texto: `A água precisa estar mais quente que a da torneira (${arred(tempAguaC, 0)} °C).` });
  return {
    tempAguaC: arred(tempAguaC, 1),
    aguaTotalKg: arred(aguaTotalKg, 1),
    geloKg: arred(gelo.geloKg, 1),
    aguaKg: arred(gelo.aguaKg, 1),
    atritoC, hidratacaoPct,
    avisos,
  };
}

// Tabela rápida (gramas de fermento seco) por temperatura ambiente × horas até assar.
function tabelaReferencia(entrada = {}, cfgBruta) {
  const cfg = normalizarConfig(cfgBruta);
  const farinhaKg = Number.isFinite(num(entrada.farinhaKg)) && num(entrada.farinhaKg) > 0 ? num(entrada.farinhaKg) : cfg.base.farinhaKg;
  const tempMassaC = Number.isFinite(num(entrada.tempMassaC)) ? num(entrada.tempMassaC) : cfg.base.tempMassaC;
  const ambientes = [16, 18, 20, 22, 24, 26, 28, 30, 32];
  const horas = [4, 5, 6, 7, 8, 9, 10, 12];
  const linhas = ambientes.map((amb) => ({
    tempAmbienteC: amb,
    valores: horas.map((h) => {
      const pct = pctNecessario(tempMassaC, amb, h, cfg);
      return { secoG: gramas(pct * farinhaKg * 10), foraDoLimite: pct < cfg.minPct || pct > cfg.maxPct };
    }),
  }));
  return { farinhaKg, tempMassaC, horas, linhas };
}

module.exports = {
  PADRAO, LIMITES_CONFIG,
  normalizarConfig, validarConfig, horasEntre, temperaturaMassa, atividade, pctNecessario, preverHoras,
  temperaturaAgua, descobrirAtrito, calcularGelo, calcularFermento, calcularAgua, tabelaReferencia,
};
