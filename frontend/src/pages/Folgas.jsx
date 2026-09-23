import { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarDays, Download, Plus, Printer, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const dataBR = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const corStatus = (s) => ({ rascunho: '#a16207', publicada: '#15803d' }[s] || '#57534e');

export default function Folgas() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'gerente'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [cats, setCats] = useState({ modelos: [], tipos: [], times: [], usuarios: [] });
  const [escalas, setEscalas] = useState([]);
  const [grade, setGrade] = useState([]);
  const [inicio, setInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [minhas, setMinhas] = useState([]);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [sols, setSols] = useState([]);
  const [msg, setMsg] = useState('');

  const [popupEsc, setPopupEsc] = useState(false);
  const [esc, setEsc] = useState({ nome: '', modelo: '5x2', tipo: 'Rotativa', time: 'A', inicio: '', fim: '', dias_semana: [], usuarios: [] });
  const [conflitos, setConflitos] = useState([]);
  const [popupInd, setPopupInd] = useState(false);
  const [ind, setInd] = useState({ usuario_id: '', data: '', tipo: 'Pontual' });
  const [popupSol, setPopupSol] = useState(false);
  const [sol, setSol] = useState({ data_inicio: '', data_fim: '', motivo: '' });

  async function carregar() {
    setMsg('');
    try {
      const c = await axios.get(`${api}/folgas/catalogos`, { headers });
      setCats(c.data);
      if (ehRH || perfil === 'editor') {
        const g = await axios.get(`${api}/folgas?inicio=${inicio}&fim=${fim}`, { headers });
        setGrade(g.data || []);
      }
      if (ehRH) {
        const e = await axios.get(`${api}/escalas`, { headers });
        setEscalas(e.data || []);
      }
      const s = await axios.get(`${api}/folgas/solicitacoes`, { headers });
      setSols(s.data || []);
      const m = await axios.get(`${api}/folgas/minhas?ano=${ano}`, { headers });
      setMinhas(m.data || []);
    } catch (e) { setMsg(e.response?.data?.error || 'Erro ao carregar.'); }
  }

  useEffect(() => { carregar().catch(() => {}); }, [inicio, fim, ano]);

  async function criarEscala(e) {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${api}/escalas`, { ...esc, usuarios: esc.usuarios.map(Number) }, { headers });
      setConflitos(data.conflitos || []);
      setMsg(`Escala salva como RASCUNHO (só o RH vê): ${data.criadas} folgas${data.conflitos.length ? `, ${data.conflitos.length} conflitos ignorados` : ''}. Publique para notificar.`);
      setPopupEsc(false);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao criar escala.'); }
  }

  async function publicarEscala(id) {
    if (!confirm('Publicar escala? Todos os funcionários serão notificados (pop + sino + e-mail quando configurado).')) return;
    const { data } = await axios.post(`${api}/escalas/${id}/publicar`, {}, { headers });
    setMsg(`Publicadas ${data.publicadas} folgas para ${data.avisados} funcionários.`);
    carregar();
  }

  async function criarInd(e) {
    e.preventDefault();
    try {
      await axios.post(`${api}/folgas`, ind, { headers });
      setPopupInd(false);
      setMsg('Folga publicada e funcionário notificado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao criar folga.'); }
  }

  async function pedirSol(e) {
    e.preventDefault();
    try {
      await axios.post(`${api}/folgas/solicitacoes`, sol, { headers });
      setPopupSol(false);
      setSol({ data_inicio: '', data_fim: '', motivo: '' });
      setMsg('Solicitação enviada ao RH.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao solicitar.'); }
  }

  async function decidir(id, decisao) {
    await axios.post(`${api}/folgas/solicitacoes/${id}/decidir`, { decisao }, { headers });
    setMsg(`Solicitação ${decisao}.`);
    carregar();
  }

  function exportarICS(f) {
    const d = String(f.data).slice(0, 10).replace(/-/g, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:folga-${f.id}@mips.lan`,
      `DTSTART:${d}`, `SUMMARY:Folga — ${f.nome_funcionario}`, `DESCRIPTION:${f.tipo}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `folga-${f.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function imprimirMinhas() {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Minhas folgas ${ano}</title><style>body{font-family:sans-serif;max-width:700px;margin:20px auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px}</style></head><body>
      <h1>Minhas folgas — ${ano}</h1><table><tr><th>Data</th><th>Tipo</th></tr>
      ${minhas.map((f) => `<tr><td>${dataBR(f.data)}</td><td>${f.tipo}</td></tr>`).join('')}</table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm';
  const porUsuario = grade.reduce((acc, f) => { (acc[f.nome_funcionario] = acc[f.nome_funcionario] || []).push(f); return acc; }, {});

  const gradeEl = (ehRH || perfil === 'editor') && (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-5">
      <h2 className="font-bold text-[var(--text-main)] mb-3">Grade de folgas</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="text-sm">De <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm" /></label>
        <label className="text-sm">Até <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm" /></label>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-auto">
        {Object.entries(porUsuario).map(([nome, fs]) => (
          <div key={nome}>
            <p className="text-sm font-bold text-[var(--text-main)]">{nome}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {fs.sort((a, b) => String(a.data).localeCompare(String(b.data))).map((f) => (
                <span key={f.id} title={`${f.tipo} · ${f.status}`} className="text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: corStatus(f.status), color: corStatus(f.status) }}>
                  {dataBR(f.data).slice(0, 5)}{f.status === 'rascunho' ? ' (rasc.)' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {!grade.length && <p className="text-sm text-[var(--text-muted)]">Sem folgas no período.</p>}
      </div>
    </section>
  );

  const conteudoRH = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><CalendarDays size={24} /> Folgas</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setPopupInd(true)} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-bold">Folga individual</button>
          <button onClick={() => setPopupEsc(true)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> Nova escala</button>
        </div>
      </div>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      {!!conflitos.length && <p className="text-sm text-amber-700 mb-3">⚠️ {conflitos.length} conflitos (funcionário já tinha folga no dia) foram ignorados automaticamente.</p>}
      {gradeEl}
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-5">
        <h2 className="font-bold text-[var(--text-main)] mb-3">Escalas (rascunho só o RH vê)</h2>
        <div className="space-y-2">
          {escalas.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 text-sm border-b border-[var(--border-color)] pb-2">
              <strong>{e.nome}</strong>
              <span className="text-[var(--text-muted)]">{e.modelo} · {e.tipo}{e.time ? ` · time ${e.time}` : ''} · {dataBR(e.inicio)} → {dataBR(e.fim)} · {e.dias_gerados} dias</span>
              <span className="text-xs font-bold" style={{ color: corStatus(e.status) }}>{e.status}</span>
              <span className="ml-auto flex gap-2">
                {e.status === 'rascunho' && <><button onClick={() => publicarEscala(e.id)} className="underline text-xs text-green-700">publicar</button>
                <button onClick={async () => { if (confirm('Excluir rascunho?')) { await axios.delete(`${api}/escalas/${e.id}`, { headers }); carregar(); } }} className="text-red-600"><Trash2 size={15} /></button></>}
              </span>
            </div>
          ))}
          {!escalas.length && <p className="text-sm text-[var(--text-muted)]">Nenhuma escala.</p>}
        </div>
      </section>
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <h2 className="font-bold text-[var(--text-main)] mb-3">Solicitações de folga</h2>
        <div className="space-y-2">
          {sols.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 text-sm border-b border-[var(--border-color)] pb-2">
              <span><strong>{s.nome_solicitante}</strong> · {dataBR(s.data_inicio)} → {dataBR(s.data_fim)}{s.motivo ? ` · ${s.motivo}` : ''}</span>
              <span className="text-xs font-bold">{s.status}</span>
              {s.status === 'pendente' && <span className="ml-auto flex gap-2">
                <button onClick={() => decidir(s.id, 'aprovada')} className="underline text-xs text-green-700">aprovar</button>
                <button onClick={() => decidir(s.id, 'recusada')} className="underline text-xs text-red-600">recusar</button>
              </span>}
            </div>
          ))}
          {!sols.length && <p className="text-sm text-[var(--text-muted)]">Nenhuma solicitação.</p>}
        </div>
      </section>

      {popupEsc && (
        <form onSubmit={criarEscala} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg space-y-3 my-8">
            <h2 className="font-bold text-lg">Nova escala (gera rascunho)</h2>
            <label className="block text-sm">Nome *<input value={esc.nome} onChange={(e) => setEsc((v) => ({ ...v, nome: e.target.value }))} required className={campo} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm">Modelo
                <select value={esc.modelo} onChange={(e) => setEsc((v) => ({ ...v, modelo: e.target.value }))} className={campo}>
                  {cats.modelos.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="block text-sm">Tipo
                <select value={esc.tipo} onChange={(e) => setEsc((v) => ({ ...v, tipo: e.target.value }))} className={campo}>
                  {cats.tipos.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              {esc.modelo === 'Revezamento' && <label className="block text-sm">Time
                <select value={esc.time} onChange={(e) => setEsc((v) => ({ ...v, time: e.target.value }))} className={campo}>
                  {cats.times.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>}
            </div>
            {esc.modelo === 'Personalizado' && (
              <div className="text-sm">Dias de folga: {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <label key={d} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={esc.dias_semana.includes(d)}
                    onChange={(e) => setEsc((v) => ({ ...v, dias_semana: e.target.checked ? [...v.dias_semana, d] : v.dias_semana.filter((x) => x !== d) }))} />
                  {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]}
                </label>))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Início<input type="date" value={esc.inicio} onChange={(e) => setEsc((v) => ({ ...v, inicio: e.target.value }))} required className={campo} /></label>
              <label className="block text-sm">Fim<input type="date" value={esc.fim} onChange={(e) => setEsc((v) => ({ ...v, fim: e.target.value }))} required className={campo} /></label>
            </div>
            <div className="text-sm">Funcionários (ciclo automático por modelo):
              <div className="max-h-44 overflow-auto border border-[var(--border-color)] rounded-xl p-2 mt-1 space-y-1">
                {cats.usuarios.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={esc.usuarios.includes(u.id)}
                      onChange={(e) => setEsc((v) => ({ ...v, usuarios: e.target.checked ? [...v.usuarios, u.id] : v.usuarios.filter((x) => x !== u.id) }))} />
                    {u.nome}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupEsc(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Gerar rascunho</button>
            </div>
          </div>
        </form>
      )}
      {popupInd && (
        <form onSubmit={criarInd} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg">Folga individual</h2>
            <label className="block text-sm">Funcionário
              <select value={ind.usuario_id} onChange={(e) => setInd((v) => ({ ...v, usuario_id: e.target.value }))} required className={campo}>
                <option value="">Selecione…</option>
                {cats.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
            <label className="block text-sm">Data<input type="date" value={ind.data} onChange={(e) => setInd((v) => ({ ...v, data: e.target.value }))} required className={campo} /></label>
            <label className="block text-sm">Tipo
              <select value={ind.tipo} onChange={(e) => setInd((v) => ({ ...v, tipo: e.target.value }))} className={campo}>
                {cats.tipos.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupInd(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Publicar</button>
            </div>
          </div>
        </form>
      )}
    </>
  );

  const conteudoFunc = (
    <>
      <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 mb-5"><CalendarDays size={24} /> Minhas Folgas</h1>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      {perfil === 'editor' && gradeEl}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <label className="text-sm">Ano <input value={ano} onChange={(e) => setAno(e.target.value)} pattern="\d{4}" className="w-24 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-sm" /></label>
        <button onClick={imprimirMinhas} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-bold inline-flex items-center gap-2"><Printer size={14} /> PDF</button>
        <button onClick={() => setPopupSol(true)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold ml-auto">Solicitar folga</button>
      </div>
      <div className="space-y-2 max-w-2xl mb-6">
        {minhas.map((f) => (
          <div key={f.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-bold text-[var(--text-main)]">{dataBR(f.data)} · {f.tipo}</p>
            </div>
            <button onClick={() => exportarICS(f)} className="p-2 rounded-lg hover:bg-[var(--bg-main)]" title="Exportar .ics"><Download size={16} /></button>
          </div>
        ))}
        {!minhas.length && <p className="text-sm text-[var(--text-muted)]">Sem folgas publicadas em {ano}.</p>}
      </div>
      <h2 className="font-bold text-[var(--text-main)] mb-2">Minhas solicitações</h2>
      <div className="space-y-2 max-w-2xl">
        {sols.map((s) => (
          <p key={s.id} className="text-sm rounded-xl border border-[var(--border-color)] px-4 py-2">{dataBR(s.data_inicio)} → {dataBR(s.data_fim)} · <strong>{s.status}</strong></p>
        ))}
        {!sols.length && <p className="text-sm text-[var(--text-muted)]">Nenhuma solicitação.</p>}
      </div>
      {popupSol && (
        <form onSubmit={pedirSol} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg">Solicitar folga</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">De<input type="date" value={sol.data_inicio} onChange={(e) => setSol((v) => ({ ...v, data_inicio: e.target.value }))} required className={campo} /></label>
              <label className="block text-sm">Até<input type="date" value={sol.data_fim} onChange={(e) => setSol((v) => ({ ...v, data_fim: e.target.value }))} required className={campo} /></label>
            </div>
            <label className="block text-sm">Motivo<input value={sol.motivo} onChange={(e) => setSol((v) => ({ ...v, motivo: e.target.value }))} className={campo} /></label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupSol(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Enviar</button>
            </div>
          </div>
        </form>
      )}
    </>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar /><main className="p-6 sm:p-10 max-w-4xl">{conteudoFunc}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 p-6 sm:p-10">{ehRH ? conteudoRH : conteudoFunc}</main></div>;
}
