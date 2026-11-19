/*
 * Lança pedidos de etiquetas (Igaratá, Paraibuna, Genéricas) direto no banco,
 * no mesmo formato que a tela admin-tools/etiquetas.html grava.
 *
 * Roda DENTRO do container portal_mips_backend (usa o `pg` e o DB_* de lá).
 * Não chame direto: use o wrapper scripts/etiquetas/lancar.ps1.
 *
 *   node lancar.js /tmp/pedidos.json                 -> só confere (prévia, não grava)
 *   node lancar.js /tmp/pedidos.json --aplicar       -> grava (faz backup em /tmp antes)
 *   opções: --aceitar-novos      aceita local que não está cadastrado
 *           --permitir-duplicado aceita pedido igual a um que já está no banco
 *
 * Formato do pedidos.json:
 * {
 *   "rotulo": "igarata-23a27nov",            // vai no nome do backup
 *   "fixos": true,                            // padrão true: põe a base fixa do banco
 *                                             // (Igaratá seg/qua, ter/qui, sex; Paraibuna cidade = CAPS)
 *   "dias_so_fixos": [{"entrega":"igarata","data":"2026-11-20"}],   // opcional
 *   "pedidos": [
 *     {"entrega":"igarata","data":"2026-11-23","local":"EMEIF IRMÃ PAULA GUIMARÃES NUNES",
 *      "produto":"integral","quantidade":400},
 *     {"entrega":"igarata","data":"2026-11-23","local":"EMEIF PETRONILHA DE SOUSA",
 *      "produto":"frances","quantidade":130,"tarde":true},          // lanche da tarde
 *     {"entrega":"paraibuna","rota":"roca","data":"2026-11-24","local":"Geraldo Martins",
 *      "produto":"leite","quantidade":100}
 *   ]
 * }
 * "produto" pode ser o id (frances, leite, integral, mini-leite, mini-frances...) ou o nome
 * ("MINI PÃO FRANCÊS INTEGRAL"); o script acha o id certo nos produtos salvos no banco.
 * "local" pode vir do jeito do PDF/planilha; o script casa com o nome cadastrado.
 */
'use strict';
const fs = require('fs');
const { Pool } = require('pg');

const args = process.argv.slice(2);
const arquivo = args.find(a => !a.startsWith('--'));
const APLICAR = args.includes('--aplicar');
const ACEITAR_NOVOS = args.includes('--aceitar-novos');
const PERMITIR_DUP = args.includes('--permitir-duplicado');
const BACKUP = '/tmp/etiquetas-backup.json';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ENTREGAS = ['igarata', 'paraibuna', 'johnson', 'genericas'];

// Nomes que os PDFs/planilhas escrevem diferente do cadastro (chave já normalizada).
const APELIDOS = {
  CCPCD: 'CCPDC',
  'EMEF LEONINA': 'EMEIF LEONINA VIEIRA DE BARROS',
  'EMEF LEONINA VIEIRA DE BARROS': 'EMEIF LEONINA VIEIRA DE BARROS',
  CAPS: 'CAPS (FIXO)',
  // Johnson (coluna "Área Solicitante" do PDF de lanche com frios)
  'SUTURAS FABRICA II': 'FAB II - ACAB. SUTURAS',
  'SUTURAS': 'FAB II - ACAB. SUTURAS',
  'COPA ACABAMENTO DE SUTURAS': 'FAB II - ACAB. SUTURAS',
  'COPA FABRICA DE AGULHAS': 'AGULHAS',
  'INNOVATIVE MEDICINE IM': 'INOVATIVE MEDICINE',
  'INNOVATIVE MEDICINE': 'INOVATIVE MEDICINE',
  'CMP MEDICAL': 'MANUTENÇÃO MEDICAL',
  'DIVFORT CAPISTRANO': 'DIVIFORT',
  'DIVFORT': 'DIVIFORT',
  'PLW ENGENHARIA': 'PLW',
  'TIME MANSERV': 'CMP - MANSERV',
  'MANSERV': 'CMP - MANSERV',
  'COPA ACABAMENTO DE SUTURAS TIME MANSERV': 'CMP - MANSERV',
};
// Locais novos aceitos com --aceitar-novos: cadastrados na lista da entrega ao gravar.
const locaisNovos = [];
const TURNOS = { 1: '1º TURNO', 2: '2º TURNO', 3: '3º TURNO' };
function lerTurno(valor) {
  const m = String(valor ?? '').match(/[123]/);
  return m ? TURNOS[m[0]] : null;
}
const PALAVRAS_VAZIAS = new Set([
  'EMEIF', 'EMEIEF', 'EMEI', 'EMEF', 'NEI', 'ESCOLA', 'MUNICIPAL', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'E',
  'D', 'NA', 'NO', 'ENTREGAR', 'HORAS', 'HS', 'H',
]);

const erros = [];
const avisos = [];

function chave(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/["'“”*().,;:/]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const tokens = texto => chave(texto).split(' ').filter(t => t && !PALAVRAS_VAZIAS.has(t) && !/^\d/.test(t));

function casarLocal(nome, cadastrados) {
  const k = chave(nome);
  const exato = cadastrados.find(c => chave(c) === k);
  if (exato) return { nome: exato, como: 'igual' };
  if (APELIDOS[k]) {
    const alvo = cadastrados.find(c => chave(c) === chave(APELIDOS[k]));
    if (alvo) return { nome: alvo, como: 'apelido' };
  }
  const tIn = new Set(tokens(nome));
  const candidatos = cadastrados
    .map(c => {
      const tC = tokens(c);
      if (!tC.length) return null;
      const cadastroDentro = tC.every(t => tIn.has(t));
      const entradaDentro = tIn.size > 0 && [...tIn].every(t => tC.includes(t));
      return cadastroDentro || entradaDentro ? { nome: c, pontos: tC.filter(t => tIn.has(t)).length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.pontos - a.pontos);
  if (candidatos.length === 1 || (candidatos.length > 1 && candidatos[0].pontos > candidatos[1].pontos)) {
    return { nome: candidatos[0].nome, como: 'parecido' };
  }
  if (candidatos.length > 1) return { ambiguo: candidatos.map(c => c.nome) };
  return null;
}

function casarProduto(valor, produtos) {
  const v = String(valor || '').trim();
  const porId = produtos.find(p => p.id === v);
  if (porId) return porId;
  const k = chave(v);
  return produtos.find(p => chave(p.name) === k || chave(p.shortName) === k) || null;
}

const dividir = (total, tamanho) => [
  ...Array(Math.floor(total / tamanho)).fill(tamanho),
  ...(total % tamanho ? [total % tamanho] : []),
];
const diaSemana = data => new Date(`${data}T12:00:00Z`).getUTCDay();
const fmt = data => data.split('-').reverse().join('/');
function grupoFixoIgarata(data) {
  const d = diaSemana(data);
  if (d === 1 || d === 3) return 'segQua';
  if (d === 2 || d === 4) return 'terQui';
  if (d === 5) return 'sexta';
  return null;
}
const produtoGravado = p => ({ id: p.id, name: p.name, shortName: p.shortName, packageSize: p.packageSize });

function montar(dados, entrada) {
  const settings = dados.settings || {};
  const produtosDe = entrega => (settings.products || {})[entrega] || [];
  const locaisDe = (entrega, rota) => {
    const d = settings.destinations || {};
    if (entrega === 'igarata') return [...(d.igarata || []), ...Object.values(settings.fixed?.igarata || {}).flat().map(f => f.destination)];
    if (entrega === 'paraibuna') return [...(d[rota] || []), ...(rota === 'cidade' ? (settings.fixed?.paraibunaCidade || []).map(f => f.destination) : [])];
    if (entrega === 'johnson') return d.johnson || [];
    return d.genericas || [];
  };

  const novos = [];
  const pedidos = Array.isArray(entrada.pedidos) ? entrada.pedidos : [];
  if (!pedidos.length && !(entrada.dias_so_fixos || []).length) erros.push('Nenhum pedido em "pedidos".');

  pedidos.forEach((p, i) => {
    const onde = `pedido #${i + 1} (${p.local || '?'})`;
    const entrega = String(p.entrega || '').toLowerCase();
    if (!ENTREGAS.includes(entrega)) return erros.push(`${onde}: entrega "${p.entrega}" inválida (use igarata, paraibuna, johnson ou genericas).`);
    const rota = entrega === 'paraibuna' ? String(p.rota || '').toLowerCase() : null;
    if (entrega === 'paraibuna' && !['cidade', 'roca'].includes(rota)) return erros.push(`${onde}: Paraibuna precisa de "rota": "cidade" ou "roca".`);
    const turno = entrega === 'johnson' ? lerTurno(p.turno) : null;
    if (entrega === 'johnson' && !turno) return erros.push(`${onde}: Johnson precisa de "turno": 1, 2 ou 3.`);
    if (entrega === 'johnson' && !p.produto) p.produto = 'frios';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '') || Number.isNaN(Date.parse(p.data))) return erros.push(`${onde}: data "${p.data}" inválida (use AAAA-MM-DD).`);
    const qtd = Number(p.quantidade);
    if (!Number.isInteger(qtd) || qtd <= 0) return erros.push(`${onde}: quantidade "${p.quantidade}" tem que ser inteiro > 0.`);
    const produto = casarProduto(p.produto, produtosDe(entrega));
    if (!produto) return erros.push(`${onde}: produto "${p.produto}" não existe em ${entrega}. Produtos: ${produtosDe(entrega).map(x => `${x.id} (${x.name})`).join(', ')}`);
    let local = String(p.local || '').trim().replace(/\s+/g, ' ');
    if (!local) return erros.push(`${onde}: falta "local".`);
    if (entrega !== 'genericas') {
      const achado = casarLocal(local, [...new Set(locaisDe(entrega, rota))]);
      if (achado?.ambiguo) return erros.push(`${onde}: "${local}" pode ser ${achado.ambiguo.join(' OU ')} — escreva o nome exato.`);
      if (achado) {
        if (achado.como !== 'igual') avisos.push(`local "${local}" → "${achado.nome}" (${achado.como})`);
        local = achado.nome;
      } else if (ACEITAR_NOVOS) {
        avisos.push(`${onde}: local NOVO "${local}" (não cadastrado) — aceito por --aceitar-novos; será cadastrado em ${entrega === 'paraibuna' ? rota : entrega}.`);
        locaisNovos.push({ lista: entrega === 'paraibuna' ? rota : entrega, nome: local });
      } else {
        return erros.push(`${onde}: local "${local}" não está cadastrado em ${entrega}${rota ? '/' + rota : ''}. Cadastrados: ${[...new Set(locaisDe(entrega, rota))].join('; ')}. Se for local novo mesmo, rode com --aceitar-novos.`);
      }
    }
    const d = diaSemana(p.data);
    if ((d === 0 || d === 6) && entrega !== 'johnson') avisos.push(`${onde}: ${fmt(p.data)} é ${DIAS[d]} — confira a data.`);
    novos.push({
      date: p.data,
      parts: dividir(qtd, produto.packageSize),
      route: rota,
      shift: turno,
      total: qtd,
      source: 'manual',
      product: produtoGravado(produto),
      delivery: entrega,
      afternoon: entrega === 'igarata' ? Boolean(p.tarde) : false,
      destination: local,
      includeDateLabels: entrega === 'johnson',
    });
  });

  // Base fixa
  const existentes = Array.isArray(dados.orders) ? dados.orders : [];
  if (entrada.fixos !== false) {
    const dias = new Set();
    novos.forEach(o => {
      if (o.delivery === 'igarata') dias.add(`igarata|${o.date}`);
      if (o.delivery === 'paraibuna' && o.route === 'cidade') dias.add(`paraibuna|${o.date}`);
    });
    (entrada.dias_so_fixos || []).forEach(x => dias.add(`${String(x.entrega).toLowerCase()}|${x.data}`));
    [...dias].sort().forEach(item => {
      const [entrega, data] = item.split('|');
      const jaTem = existentes.some(o => o.delivery === entrega && o.date === data && o.source === 'fixo' && (entrega !== 'paraibuna' || o.route === 'cidade'));
      if (jaTem) return avisos.push(`${entrega} ${fmt(data)}: base fixa já está no banco — não repeti.`);
      let lista = [];
      if (entrega === 'igarata') {
        const grupo = grupoFixoIgarata(data);
        if (!grupo) return avisos.push(`igarata ${fmt(data)} (${DIAS[diaSemana(data)]}): sem base fixa nesse dia.`);
        lista = settings.fixed?.igarata?.[grupo] || [];
      } else if (entrega === 'paraibuna') {
        lista = settings.fixed?.paraibunaCidade || [];
      }
      lista.forEach(f => {
        const produto = casarProduto(f.productId, produtosDe(entrega));
        if (!produto) return erros.push(`base fixa ${entrega}: produto ${f.productId} sumiu do cadastro.`);
        novos.push({
          date: data,
          parts: dividir(f.quantity, produto.packageSize),
          route: entrega === 'paraibuna' ? 'cidade' : null,
          shift: null,
          total: f.quantity,
          source: 'fixo',
          product: produtoGravado(produto),
          delivery: entrega,
          afternoon: false,
          destination: f.destination,
          includeDateLabels: false,
        });
      });
    });
  }

  // Duplicados (contra o banco e dentro do próprio arquivo)
  // "sub" = rota (Paraibuna) ou turno (Johnson)
  const sub = o => o.route || o.shift || '';
  const assinatura = o => [o.delivery, sub(o), o.date, chave(o.destination), o.product.id, o.afternoon ? 'tarde' : ''].join('|');
  const noBanco = new Map(existentes.map(o => [assinatura({ ...o, product: o.product || {} }), o]));
  const noArquivo = new Set();
  novos.forEach(o => {
    const a = assinatura(o) + '|' + o.total; // no arquivo, linhas com quantidades diferentes são pedidos distintos
    const txt = `${o.delivery}${sub(o) ? '/' + sub(o) : ''} ${fmt(o.date)} ${o.destination} ${o.product.name} ${o.total}`;
    if (noArquivo.has(a)) avisos.push(`REPETIDO no próprio arquivo: ${txt} (ok se o arquivo tem mesmo duas linhas iguais; se for lanche da tarde, marque "tarde": true).`);
    noArquivo.add(a);
    const b = assinatura(o);
    if (o.source === 'manual' && noBanco.has(b)) {
      const msg = `JÁ EXISTE no banco: ${txt} (banco tem ${noBanco.get(b).total}).`;
      if (PERMITIR_DUP) avisos.push(msg); else erros.push(`${msg} Use --permitir-duplicado só se for de propósito.`);
    }
  });
  const diasNovos = new Set(novos.filter(o => o.source === 'manual').map(o => `${o.delivery}|${sub(o)}|${o.date}`));
  diasNovos.forEach(d => {
    const [entrega, rota, data] = d.split('|');
    const n = existentes.filter(o => o.delivery === entrega && sub(o) === rota && o.date === data && o.source === 'manual').length;
    if (n) avisos.push(`ATENÇÃO: ${entrega}${rota ? '/' + rota : ''} ${fmt(data)} já tem ${n} pedido(s) manual(is) no banco — confira se não está lançando de novo.`);
  });
  return novos;
}

function resumo(novos) {
  const grupos = new Map();
  novos.forEach(o => {
    const k = `${o.delivery}|${o.route || o.shift || ''}|${o.date}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(o);
  });
  const linhas = [];
  [...grupos.keys()].sort((a, b) => a.split('|')[2].localeCompare(b.split('|')[2]) || a.localeCompare(b)).forEach(k => {
    const [entrega, rota, data] = k.split('|');
    const lista = grupos.get(k);
    const manuais = lista.filter(o => o.source === 'manual');
    const fixos = lista.filter(o => o.source === 'fixo');
    linhas.push(`\n== ${entrega.toUpperCase()}${rota ? ' / ' + rota : ''} — ${DIAS[diaSemana(data)]} ${fmt(data)} — ${manuais.length} manual(is) + ${fixos.length} fixo(s)`);
    manuais.forEach(o => linhas.push(`   ${String(o.total).padStart(5)}  ${o.product.name.padEnd(26)} ${o.destination}${o.afternoon ? '  (LANCHE DA TARDE)' : ''}   pacotes: ${o.parts.join('+')}`));
    if (fixos.length) linhas.push(`   + base fixa: ${fixos.map(o => `${o.destination} ${o.total}`).join(', ')}`);
    const porProduto = {};
    lista.forEach(o => { porProduto[o.product.name] = (porProduto[o.product.name] || 0) + o.total; });
    const soManual = {};
    manuais.forEach(o => { soManual[o.product.name] = (soManual[o.product.name] || 0) + o.total; });
    linhas.push(`   total manuais: ${Object.entries(soManual).map(([p, q]) => `${p} ${q}`).join(' | ') || '-'}`);
    linhas.push(`   total do dia (com fixos): ${Object.entries(porProduto).map(([p, q]) => `${p} ${q}`).join(' | ')}`);
  });
  return linhas.join('\n');
}

async function main() {
  if (!arquivo) { console.error('Uso: node lancar.js /tmp/pedidos.json [--aplicar]'); process.exit(2); }
  let entrada;
  try { entrada = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')); }
  catch (e) { console.error(`ERRO: pedidos.json inválido: ${e.message}`); process.exit(2); }

  const pool = new Pool({
    user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'mips_db', password: process.env.DB_PASS || 'postgres',
  });
  const cliente = await pool.connect();
  let codigo = 0;
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(`SELECT dados FROM ferramentas_admin_estado WHERE chave='etiquetas' FOR UPDATE`);
    if (!r.rows.length) throw new Error('Não existe registro "etiquetas" no banco.');
    const dados = r.rows[0].dados;
    const novos = montar(dados, entrada);

    console.log(resumo(novos));
    console.log(`\nTOTAL: ${novos.length} pedido(s) (${novos.filter(o => o.source === 'manual').length} manuais + ${novos.filter(o => o.source === 'fixo').length} fixos). Banco hoje: ${(dados.orders || []).length} pedidos.`);
    const avisosUnicos = [...new Set(avisos)];
    if (avisosUnicos.length) console.log(`\nAVISOS (${avisosUnicos.length}):\n- ${avisosUnicos.join('\n- ')}`);
    if (erros.length) {
      console.log(`\nERROS (${erros.length}) — nada foi gravado:\n- ${erros.join('\n- ')}`);
      await cliente.query('ROLLBACK');
      codigo = 1;
      return;
    }
    if (!APLICAR) {
      await cliente.query('ROLLBACK');
      console.log('\nPRÉVIA: nada foi gravado. Mostre este resumo ao usuário e, com o OK dele, rode de novo com -Aplicar (lancar.ps1).');
      return;
    }
    fs.writeFileSync(BACKUP, JSON.stringify(dados));
    const maxId = Math.max(0, ...(dados.orders || []).map(o => Number(o.id) || 0));
    let id = Math.max(Date.now(), maxId + 1);
    novos.forEach(o => { o.id = id++; });
    const ordenar = o => ({ id: o.id, ...o });
    dados.orders = [...(dados.orders || []), ...novos.map(ordenar)];
    if (locaisNovos.length) {
      dados.settings = dados.settings || {};
      dados.settings.destinations = dados.settings.destinations || {};
      locaisNovos.forEach(({ lista, nome }) => {
        const atual = dados.settings.destinations[lista] || (dados.settings.destinations[lista] = []);
        if (!atual.some(n => chave(n) === chave(nome))) {
          atual.push(nome);
          console.log(`Local novo cadastrado em ${lista}: ${nome}`);
        }
      });
    }
    await cliente.query(
      `UPDATE ferramentas_admin_estado SET dados=$1, atualizado_em=CURRENT_TIMESTAMP WHERE chave='etiquetas'`,
      [JSON.stringify(dados)]
    );
    await cliente.query('COMMIT');
    console.log(`\nGRAVADO: ${novos.length} pedido(s). Banco agora: ${dados.orders.length} pedidos.`);
    console.log('Avise o usuário: recarregar (F5) a página de Etiquetas antes de mexer nela.');
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(`ERRO: ${e.message}`);
    codigo = 1;
  } finally {
    cliente.release();
    await pool.end();
    process.exitCode = codigo;
  }
}

main();
