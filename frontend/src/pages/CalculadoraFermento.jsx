import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Wheat, Thermometer, Clock, Droplets, Printer, Settings2, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

// Calculadora de fermento do pão francês (massa de sal). A conta é feita no
// backend (backend/fermento.js) para que todos usem exatamente a mesma regra.
const CHAVE_LOCAL = 'calculadora-fermento';
const fmt = (v, casas = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const fmtHoras = (h) => {
  if (h == null) return '—';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60); const mm = total % 60;
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
};
const agoraHHMM = (somaHoras = 0) => {
  const d = new Date(Date.now() + somaHoras * 3600000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`;
};

function lerLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || '{}') || {}; } catch { return {}; }
}

const CAMPOS_BASE = [
  ['base.farinhaKg', 'Farinha da base', 'kg'],
  ['base.fermentoSecoG', 'Fermento seco da base', 'g'],
  ['base.tempMassaC', 'Massa saindo da masseira (base)', '°C'],
  ['base.tempAmbienteC', 'Temperatura ambiente (base)', '°C'],
  ['base.horas', 'Tempo até assar (base)', 'h'],
  ['grausParaDobrar', 'A cada quantos °C o fermento dobra a velocidade', '°C'],
  ['tauHoras', 'Tempo para a massa pegar a temperatura do ambiente', 'h'],
  ['fatorFresco', 'Fermento fresco = seco ×', '×'],
  ['minPct', 'Mínimo de fermento seco', '% farinha'],
  ['maxPct', 'Máximo de fermento seco', '% farinha'],
  ['hidratacaoPct', 'Água da receita', '% farinha'],
  ['atritoC', 'Aquecimento da masseira (atrito)', '°C'],
];
const lerCaminho = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const gravarCaminho = (o, c, v) => {
  const [a, b] = c.split('.');
  return b ? { ...o, [a]: { ...o[a], [b]: v } } : { ...o, [a]: v };
};

function Campo({ rotulo, unidade, valor, aoMudar, icone, tipo = 'number', passo = 'any', dica }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-1.5 mb-1">{icone}{rotulo}</span>
      <div className="flex items-stretch rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--primary)]">
        <input type={tipo} inputMode={tipo === 'number' ? 'decimal' : undefined} step={passo} value={valor} onChange={(e) => aoMudar(e.target.value)}
          className="flex-1 min-w-0 px-3 py-3 text-lg font-bold bg-transparent text-[var(--text-main)] outline-none" />
        {unidade && <span className="px-3 grid place-items-center text-sm text-[var(--text-muted)] border-l border-[var(--border-color)]">{unidade}</span>}
      </div>
      {dica && <span className="block text-xs text-[var(--text-muted)] mt-1">{dica}</span>}
    </label>
  );
}

function Avisos({ itens }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-2 mt-4">
      {itens.map((a, i) => (
        <div key={i} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${a.nivel === 'alerta' ? 'bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/30' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'}`}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{a.texto}</span>
        </div>
      ))}
    </div>
  );
}

function SecaoDobravel({ aberta, alternar, titulo, icone, children }) {
  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] mb-4 no-print">
      <button onClick={alternar} className="w-full flex items-center gap-2 px-5 py-4 text-left font-bold text-[var(--text-main)]">
        {icone}<span className="flex-1">{titulo}</span>{aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {aberta && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

export default function CalculadoraFermento() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehAdmin = perfil === 'administrador';
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const salvo = useMemo(lerLocal, []);

  const [farinhaKg, setFarinhaKg] = useState(salvo.farinhaKg ?? '50');
  const [tempMassaC, setTempMassaC] = useState(salvo.tempMassaC ?? '20');
  const [tempAmbienteC, setTempAmbienteC] = useState(salvo.tempAmbienteC ?? '24');
  const [modoTempo, setModoTempo] = useState(salvo.modoTempo || 'horario');
  const [horas, setHoras] = useState(salvo.horas ?? '8');
  const [inicio, setInicio] = useState(agoraHHMM());
  const [forno, setForno] = useState(salvo.forno || agoraHHMM(8));
  const [tempFarinhaC, setTempFarinhaC] = useState(salvo.tempFarinhaC ?? '');
  const [tempTorneiraC, setTempTorneiraC] = useState(salvo.tempTorneiraC ?? '');

  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [config, setConfig] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [msgConfig, setMsgConfig] = useState('');
  const [abertos, setAbertos] = useState({ agua: !!(salvo.tempFarinhaC || salvo.tempTorneiraC), tabela: false, base: false, como: false });
  const [atrito, setAtrito] = useState({ tempMassaC: '', tempFarinhaC: '', tempAmbienteC: '', tempAguaC: '' });
  const [atritoRes, setAtritoRes] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    axios.get(`${API}/api/fermento/config`, { headers })
      .then((r) => { setConfig(r.data.config); setRascunho(r.data.config); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ farinhaKg, tempMassaC, tempAmbienteC, modoTempo, horas, forno, tempFarinhaC, tempTorneiraC })); } catch { /* sem armazenamento */ }
    const corpo = { farinhaKg, tempMassaC, tempAmbienteC, tabela: true };
    if (modoTempo === 'horas') corpo.horas = horas; else { corpo.inicio = inicio; corpo.forno = forno; }
    if (tempFarinhaC !== '' && tempTorneiraC !== '') corpo.agua = { tempFarinhaC, tempTorneiraC };
    const meu = ++seq.current;
    const t = setTimeout(() => {
      axios.post(`${API}/api/fermento/calcular`, corpo, { headers })
        .then((r) => { if (meu === seq.current) { setResultado(r.data); setErro(''); } })
        .catch((e) => { if (meu === seq.current) { setResultado(null); setErro(e.response?.data?.error || 'Não foi possível calcular agora.'); } });
    }, 250);
    return () => clearTimeout(t);
  }, [farinhaKg, tempMassaC, tempAmbienteC, modoTempo, horas, inicio, forno, tempFarinhaC, tempTorneiraC, config]);

  const alternar = (k) => setAbertos((v) => ({ ...v, [k]: !v[k] }));
  const f = resultado?.fermento;
  const agua = resultado?.agua;
  const tabela = resultado?.tabela;

  async function salvarBase() {
    setMsgConfig('');
    try {
      const r = await axios.put(`${API}/api/fermento/config`, { config: rascunho }, { headers });
      setConfig(r.data.config); setRascunho(r.data.config);
      setMsgConfig('Base salva. Todos os cálculos já usam os novos valores.');
    } catch (e) { setMsgConfig(e.response?.data?.error || 'Erro ao salvar a base.'); }
  }

  async function calcularAtrito() {
    try {
      const r = await axios.post(`${API}/api/fermento/atrito`, atrito, { headers });
      setAtritoRes(`Atrito medido: ${fmt(r.data.atritoC, 1)} °C`);
      if (ehAdmin) setRascunho((v) => (v ? { ...v, atritoC: r.data.atritoC } : v));
    } catch (e) { setAtritoRes(e.response?.data?.error || 'Erro no cálculo.'); }
  }

  function imprimirTabela() {
    document.body.classList.add('fermento-imprimindo');
    const limpar = () => { document.body.classList.remove('fermento-imprimindo'); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    window.print();
  }

  const conteudo = (
    <div className="max-w-4xl">
      <style>{`@media print {
        body.fermento-imprimindo * { visibility: hidden !important; }
        body.fermento-imprimindo .fermento-tabela-impressao, body.fermento-imprimindo .fermento-tabela-impressao * { visibility: visible !important; }
        body.fermento-imprimindo .fermento-tabela-impressao { display: block !important; position: absolute; left: 0; top: 0; width: 100%; color: #111; }
        .fermento-tabela-impressao table { border-collapse: collapse; width: 100%; font-size: 11pt; }
        .fermento-tabela-impressao th, .fermento-tabela-impressao td { border: 1px solid #555; padding: 5px; text-align: center; }
      }`}</style>

      <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 mb-1 no-print"><Wheat size={26} /> Calculadora de fermento</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6 no-print">Pão francês (massa de sal) · fermentação no carrinho, sem estufa.</p>

      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-4 no-print">
        <div className="grid sm:grid-cols-3 gap-4">
          <Campo rotulo="Farinha" unidade="kg" valor={farinhaKg} aoMudar={setFarinhaKg} icone={<Wheat size={15} />} />
          <Campo rotulo="Massa saindo da masseira" unidade="°C" valor={tempMassaC} aoMudar={setTempMassaC} icone={<Thermometer size={15} />} dica="Meça com o termômetro espeto" />
          <Campo rotulo="Temperatura ambiente" unidade="°C" valor={tempAmbienteC} aoMudar={setTempAmbienteC} icone={<Thermometer size={15} />} dica="Média esperada até assar" />
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={15} className="text-[var(--text-main)]" />
            <span className="text-sm font-semibold text-[var(--text-main)]">Tempo de crescimento</span>
            <div className="ml-auto inline-flex rounded-lg border border-[var(--border-color)] overflow-hidden text-xs">
              {[['horario', 'Por horário'], ['horas', 'Em horas']].map(([v, t]) => (
                <button key={v} onClick={() => setModoTempo(v)} className={`px-3 py-1.5 ${modoTempo === v ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'}`}>{t}</button>
              ))}
            </div>
          </div>
          {modoTempo === 'horario' ? (
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Massa sai da masseira às" tipo="time" valor={inicio} aoMudar={setInicio} />
              <Campo rotulo="Pão precisa ir ao forno às" tipo="time" valor={forno} aoMudar={setForno} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Horas até assar" unidade="h" valor={horas} aoMudar={setHoras} />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-[var(--primary)] bg-[var(--bg-card)] p-5 mb-4 no-print">
        {erro && <p className="text-red-500 font-semibold">{erro}</p>}
        {!erro && !f && <p className="text-[var(--text-muted)]">Calculando…</p>}
        {f && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Fermento SECO</p>
                <p className="text-5xl font-black text-[var(--text-main)]">{fmt(f.secoG)} <span className="text-2xl">g</span></p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{fmt(f.pct, 2)}% da farinha · {fmt(f.gPorKg, 1)} g por kg</p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">ou fermento FRESCO</p>
                <p className="text-3xl font-bold text-[var(--text-main)]">{fmt(f.frescoG)} <span className="text-lg">g</span></p>
                <p className="text-sm text-[var(--text-muted)] mt-1">Tempo considerado: {fmtHoras(f.horas)}</p>
              </div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 text-sm text-[var(--text-muted)]">
              <p>• Dose padrão ({fmt(f.dosePadrao.secoG)} g): {f.dosePadrao.horas == null ? 'não fica pronta em tempo razoável' : <>ficaria pronta em <b className="text-[var(--text-main)]">~{fmtHoras(f.dosePadrao.horas)}</b></>}</p>
              <p>• {f.fatorSobreBase === 1 ? 'Igual à base' : f.fatorSobreBase > 1 ? `${fmt((f.fatorSobreBase - 1) * 100)}% a mais que a base` : `${fmt((1 - f.fatorSobreBase) * 100)}% a menos que a base`}</p>
              <p>• A massa chega ao forno a ~{fmt(f.tempMassaNoFornoC, 0)} °C</p>
            </div>
            <Avisos itens={f.avisos} />
            <p className="text-xs text-[var(--text-muted)] mt-4">Conferir sempre o ponto do pão: o cálculo é uma referência padronizada, não substitui o olho do padeiro.</p>
          </>
        )}
      </section>

      <SecaoDobravel aberta={abertos.agua} alternar={() => alternar('agua')} titulo="Água e gelo (para acertar a temperatura da massa)" icone={<Droplets size={18} />}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo rotulo="Temperatura da farinha" unidade="°C" valor={tempFarinhaC} aoMudar={setTempFarinhaC} />
          <Campo rotulo="Temperatura da água da torneira" unidade="°C" valor={tempTorneiraC} aoMudar={setTempTorneiraC} />
        </div>
        {!agua && <p className="text-sm text-[var(--text-muted)] mt-3">Preencha as duas temperaturas para ver a água e o gelo e fazer a massa sair a {tempMassaC || '—'} °C.</p>}
        {agua?.erro && <p className="text-sm text-red-500 mt-3">{agua.erro}</p>}
        {agua && !agua.erro && (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-[var(--bg-main)] p-3"><p className="text-xs text-[var(--text-muted)]">Água deve entrar a</p><p className="text-2xl font-bold text-[var(--text-main)]">{fmt(agua.tempAguaC, 0)} °C</p></div>
              <div className="rounded-xl bg-[var(--bg-main)] p-3"><p className="text-xs text-[var(--text-muted)]">Água da torneira</p><p className="text-2xl font-bold text-[var(--text-main)]">{fmt(agua.aguaKg, 1)} L</p></div>
              <div className="rounded-xl bg-[var(--bg-main)] p-3"><p className="text-xs text-[var(--text-muted)]">Gelo</p><p className="text-2xl font-bold text-[var(--text-main)]">{fmt(agua.geloKg, 1)} kg</p></div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">Total de água: {fmt(agua.aguaTotalKg, 1)} L ({fmt(agua.hidratacaoPct)}% da farinha) · aquecimento da masseira considerado: {fmt(agua.atritoC, 1)} °C.</p>
            <Avisos itens={agua.avisos} />
          </div>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-[var(--text-muted)]">A massa saiu com temperatura diferente? Descobrir o aquecimento real da masseira</summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {[['tempMassaC', 'Massa saiu a'], ['tempFarinhaC', 'Farinha estava a'], ['tempAmbienteC', 'Ambiente estava a'], ['tempAguaC', 'Água entrou a']].map(([k, t]) => (
              <Campo key={k} rotulo={t} unidade="°C" valor={atrito[k]} aoMudar={(v) => setAtrito((a) => ({ ...a, [k]: v }))} />
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={calcularAtrito} className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold">Calcular</button>
            {atritoRes && <span className="text-[var(--text-main)]">{atritoRes}{ehAdmin && ' — já colocado na base abaixo, é só salvar.'}{!ehAdmin && ' — passe esse valor para o administrador.'}</span>}
          </div>
        </details>
      </SecaoDobravel>

      <SecaoDobravel aberta={abertos.tabela} alternar={() => alternar('tabela')} titulo="Tabela rápida para imprimir" icone={<Printer size={18} />}>
        {tabela ? (
          <>
            <p className="text-sm text-[var(--text-muted)] mb-3">Gramas de fermento SECO para {fmt(tabela.farinhaKg)} kg de farinha com a massa saindo a {fmt(tabela.tempMassaC)} °C. Em vermelho: fora dos limites recomendados.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center border-collapse">
                <thead><tr><th className="p-2 border border-[var(--border-color)] text-[var(--text-muted)]">Ambiente ↓ / Horas →</th>{tabela.horas.map((h) => <th key={h} className="p-2 border border-[var(--border-color)] text-[var(--text-main)]">{h}h</th>)}</tr></thead>
                <tbody>
                  {tabela.linhas.map((l) => (
                    <tr key={l.tempAmbienteC}>
                      <th className="p-2 border border-[var(--border-color)] text-[var(--text-main)]">{l.tempAmbienteC} °C</th>
                      {l.valores.map((v, i) => <td key={i} className={`p-2 border border-[var(--border-color)] ${v.foraDoLimite ? 'text-red-500' : 'text-[var(--text-main)]'}`}>{v.secoG}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={imprimirTabela} className="mt-4 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold inline-flex items-center gap-2"><Printer size={16} /> Imprimir tabela</button>
          </>
        ) : <p className="text-sm text-[var(--text-muted)]">Preencha a farinha e a temperatura da massa.</p>}
      </SecaoDobravel>

      <SecaoDobravel aberta={abertos.como} alternar={() => alternar('como')} titulo="Como a conta funciona" icone={<Info size={18} />}>
        <ul className="text-sm text-[var(--text-main)] space-y-2 list-disc pl-5">
          <li>Parte da base que funciona na padaria: <b>{config ? `${fmt(config.base.fermentoSecoG)} g de seco para ${fmt(config.base.farinhaKg)} kg de farinha, massa a ${fmt(config.base.tempMassaC)} °C, ambiente ${fmt(config.base.tempAmbienteC)} °C e ${fmtHoras(config.base.horas)} até assar` : '…'}</b>.</li>
          <li><b>Tempo:</b> menos tempo pede mais fermento. Com metade do tempo, o fermento quase dobra.</li>
          <li><b>Temperatura:</b> o fermento trabalha 2× mais rápido a cada {config ? fmt(config.grausParaDobrar) : '…'} °C a mais. Calor pede menos fermento; frio pede mais.</li>
          <li>Sem estufa, a massa sai da masseira e vai pegando a temperatura do ambiente no carrinho. A conta acompanha isso hora a hora.</li>
          <li><b>Água:</b> água = 3 × temperatura desejada da massa − farinha − ambiente − aquecimento da masseira. Se der abaixo da torneira, troca parte da água por gelo.</li>
          <li>Fresco = seco × {config ? fmt(config.fatorFresco, 1) : '…'}.</li>
        </ul>
      </SecaoDobravel>

      {ehAdmin && rascunho && (
        <SecaoDobravel aberta={abertos.base} alternar={() => alternar('base')} titulo="Base de cálculo (Administrador)" icone={<Settings2 size={18} />}>
          <p className="text-sm text-[var(--text-muted)] mb-4">Ajuste aqui se a padaria perceber que o pão está passando do ponto ou ficando cru no horário. Vale para todos os usuários.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {CAMPOS_BASE.map(([c, rotulo, un]) => (
              <Campo key={c} rotulo={rotulo} unidade={un} valor={lerCaminho(rascunho, c) ?? ''} aoMudar={(v) => setRascunho((r) => gravarCaminho(r, c, v))} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button onClick={salvarBase} className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold">Salvar base</button>
            <button onClick={() => setRascunho(config)} className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-[var(--text-main)]">Descartar alterações</button>
            {msgConfig && <span className="text-sm text-[var(--text-main)]">{msgConfig}</span>}
          </div>
        </SecaoDobravel>
      )}

      {tabela && (
        <div className="fermento-tabela-impressao" style={{ display: 'none' }}>
          <h2 style={{ fontSize: '16pt', fontWeight: 700, marginBottom: 4 }}>Fermento SECO (g) — Pão francês</h2>
          <p style={{ marginBottom: 10 }}>{fmt(tabela.farinhaKg)} kg de farinha · massa saindo da masseira a {fmt(tabela.tempMassaC)} °C · fresco = seco × {config ? fmt(config.fatorFresco, 1) : 3}</p>
          <table>
            <thead><tr><th>Ambiente / Horas até assar</th>{tabela.horas.map((h) => <th key={h}>{h}h</th>)}</tr></thead>
            <tbody>{tabela.linhas.map((l) => <tr key={l.tempAmbienteC}><th>{l.tempAmbienteC} °C</th>{l.valores.map((v, i) => <td key={i}>{v.foraDoLimite ? `(${v.secoG})` : v.secoG}</td>)}</tr>)}</tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: '9pt' }}>Valores entre parênteses: fora dos limites recomendados. Gerado em {new Date().toLocaleDateString('pt-BR')} pela Calculadora de fermento do portal.</p>
        </div>
      )}
    </div>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar titulo="Fermento" /><main className="p-4 sm:p-10">{conteudo}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 min-w-0 p-4 sm:p-10">{conteudo}</main></div>;
}
