import { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarCheck, CalendarPlus, Download, FileUp, HeartPulse, Plus, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const corFaixa = (f) => ({
  Vermelho: { cor: '#b91c1c', fundo: '#fee2e2', icone: '🔴' },
  Laranja: { cor: '#c2410c', fundo: '#ffedd5', icone: '🟠' },
  Amarelo: { cor: '#a16207', fundo: '#fef9c3', icone: '🟡' },
  Verde: { cor: '#15803d', fundo: '#dcfce7', icone: '🟢' },
  Pendente: { cor: '#57534e', fundo: '#e7e5e4', icone: '⚪' },
}[f] || { cor: '#57534e', fundo: '#e7e5e4', icone: '⚪' });

const pct = (v) => (v === null || v === undefined || v === '' ? '—' : `${Math.round(Number(v) * 100)}%`);
const dataBR = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const isoHoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
function paraICSData(v) {
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export default function ASO() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'rh'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [aba, setAba] = useState('funcionarios');
  const [resumo, setResumo] = useState(null);
  const [itens, setItens] = useState([]);
  const [faixa, setFaixa] = useState('');
  const [busca, setBusca] = useState('');
  const [meu, setMeu] = useState(null);
  const [msg, setMsg] = useState('');

  // Popups
  const [popupNovo, setPopupNovo] = useState(false);
  const [novo, setNovo] = useState({ nome_funcionario: '', matricula: '', data_admissao: '', ultimo_exame: '', vencimento: '' });
  const [popupExame, setPopupExame] = useState(null); // aso em atualização
  const [exame, setExame] = useState({ ultimo_exame: '', vencimento: '' });
  const [pdfExame, setPdfExame] = useState(null);

  // Agendamentos (mesma página)
  const [ags, setAgs] = useState([]);
  const [locais, setLocais] = useState([]);
  const [popupAg, setPopupAg] = useState(false);
  const [ag, setAg] = useState({ aso_id: '', data_hora: '', local_id: '', observacoes: '' });
  const [reagendando, setReagendando] = useState(null);
  const [novaData, setNovaData] = useState('');

  async function carregar() {
    setMsg('');
    try {
      if (ehRH) {
        const q = new URLSearchParams();
        if (faixa) q.set('faixa', faixa);
        if (busca.trim()) q.set('busca', busca.trim());
        const [r, s, a, l] = await Promise.all([
          axios.get(`${api}/asos${q.toString() ? `?${q}` : ''}`, { headers }),
          axios.get(`${api}/asos/resumo`, { headers }),
          axios.get(`${api}/agendamentos-aso`, { headers }),
          axios.get(`${api}/locais-exame?situacao=ativos`, { headers }),
        ]);
        setItens(r.data || []);
        setResumo(s.data || null);
        setAgs(a.data || []);
        setLocais(l.data || []);
      } else {
        const { data } = await axios.get(`${api}/asos/meu`, { headers });
        setMeu(data);
      }
    } catch (e) { setMsg(e.response?.data?.error || 'Erro ao carregar ASOs.'); }
  }

  useEffect(() => { carregar(); }, [faixa]);
  useEffect(() => {
    const t = setTimeout(() => { if (ehRH) carregar(); }, busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [busca]);

  // ---- Novo funcionário ----
  async function salvarNovo(e) {
    e.preventDefault();
    try {
      await axios.post(`${api}/asos`, {
        ...novo,
        nome_funcionario: novo.nome_funcionario.trim(),
        data_admissao: novo.data_admissao || null,
        ultimo_exame: novo.ultimo_exame || null,
        vencimento: novo.vencimento || null,
      }, { headers });
      setPopupNovo(false);
      setNovo({ nome_funcionario: '', matricula: '', data_admissao: '', ultimo_exame: '', vencimento: '' });
      setMsg('Funcionário cadastrado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao cadastrar.'); }
  }

  // ---- Atualizar exame (último exame + vencimento + PDF) ----
  function abrirExame(a, sugestao) {
    setPopupExame(a);
    setExame({
      ultimo_exame: sugestao?.ultimo_exame || String(a.ultimo_exame || '').slice(0, 10),
      vencimento: sugestao?.vencimento || String(a.vencimento || '').slice(0, 10),
    });
    setPdfExame(null);
  }

  async function salvarExame(e) {
    e.preventDefault();
    try {
      await axios.put(`${api}/asos/${popupExame.id}`, {
        ultimo_exame: exame.ultimo_exame || null,
        vencimento: exame.vencimento || null,
      }, { headers });
      if (pdfExame) {
        const dados = new FormData();
        dados.append('pdf', pdfExame);
        await axios.post(`${api}/asos/${popupExame.id}/pdf`, dados, { headers });
      }
      setPopupExame(null);
      setMsg('Exame atualizado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao atualizar exame.'); }
  }

  // ---- PDF: anexar (1ª vez) ou alterar ----
  async function enviarPDF(id, arquivo) {
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('pdf', arquivo);
    try {
      await axios.post(`${api}/asos/${id}/pdf`, dados, { headers });
      setMsg('PDF atualizado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao enviar PDF.'); }
  }

  // ---- Agendamentos ----
  function abrirAgendar(asoId) {
    // Preenchimento automático: funcionário já vem selecionado; RH só ajusta data/local.
    setAg({ aso_id: asoId ? String(asoId) : '', data_hora: '', local_id: '', observacoes: '' });
    setPopupAg(true);
  }

  async function salvarAg(e) {
    e.preventDefault();
    const aso = itens.find((x) => String(x.id) === String(ag.aso_id));
    if (!aso) { setMsg('Selecione o funcionário.'); return; }
    try {
      await axios.post(`${api}/agendamentos-aso`, {
        aso_id: Number(ag.aso_id),
        nome_funcionario: aso.nome_funcionario,
        data_hora: ag.data_hora,
        local_id: ag.local_id ? Number(ag.local_id) : null,
        observacoes: ag.observacoes,
      }, { headers });
      setPopupAg(false);
      setMsg(`Agendado para ${aso.nome_funcionario} — ele foi notificado no sino.`);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao agendar.'); }
  }

  async function reagendar(id) {
    if (!novaData) return;
    try {
      await axios.put(`${api}/agendamentos-aso/${id}`, { data_hora: novaData }, { headers });
      setReagendando(null);
      setNovaData('');
      setMsg('Reagendado (funcionário notificado).');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao reagendar.'); }
  }

  async function confirmarAg(id) {
    try {
      await axios.post(`${api}/agendamentos-aso/${id}/confirmar`, {}, { headers });
      setMsg('Presença confirmada.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao confirmar.'); }
  }

  async function concluirAg(agItem) {
    // Ao marcar realizado, abre o popup de exame já preenchido (data do agendamento
    // como último exame + vencimento +365 dias) — RH altera se algo mudou.
    try {
      await axios.put(`${api}/agendamentos-aso/${agItem.id}`, { realizado: !agItem.realizado }, { headers });
      if (!agItem.realizado) {
        const aso = itens.find((x) => Number(x.id) === Number(agItem.aso_id));
        const base = String(agItem.data_hora).slice(0, 10);
        if (aso) abrirExame(aso, { ultimo_exame: base, vencimento: somarDias(base, 365) });
        setMsg('Agendamento concluído — confira/atualize o exame abaixo.');
      }
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao atualizar.'); }
  }

  async function excluirAg(id) {
    if (!confirm('Excluir este agendamento?')) return;
    await axios.delete(`${api}/agendamentos-aso/${id}`, { headers });
    carregar();
  }

  function exportarICS(agItem) {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `UID:agaso-${agItem.id}@mips.lan`, `DTSTART:${paraICSData(agItem.data_hora)}`,
      `SUMMARY:ASO — ${agItem.nome_funcionario}`, `DESCRIPTION:${(agItem.observacoes || '').replace(/\n/g, ' ')}`,
      `LOCATION:${(agItem.local_nome || '').replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aso-${agItem.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function confirmarMeu() {
    try {
      await axios.post(`${api}/asos/${meu.id}/confirmar-presenca`, {}, { headers });
      setMsg('Presença confirmada — o RH foi avisado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao confirmar presença.'); }
  }

  function exportarCSV() {
    const linhas = [['Nome', 'Matrícula', 'Admissão', 'Último exame', 'Vencimento', 'Dias restantes', '% restante', 'Faixa', 'Faixa planilha']];
    for (const a of itens) {
      linhas.push([a.nome_funcionario, a.matricula, String(a.data_admissao || '').slice(0, 10),
        String(a.ultimo_exame || '').slice(0, 10), String(a.vencimento || '').slice(0, 10),
        a.dias_restantes ?? '', a.percentual_restante ?? '', a.faixa, a.faixa_importada || '']);
    }
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'asos.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm';

  const conteudoRH = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><HeartPulse size={24} /> Controle de ASO</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setPopupNovo(true)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> Novo funcionário</button>
          <button onClick={() => abrirAgendar('')} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium flex items-center gap-2"><CalendarPlus size={16} /> Agendar exame</button>
          <button onClick={exportarCSV} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium">CSV</button>
        </div>
      </div>
      <div className="flex gap-1 mb-5">
        {[['funcionarios', 'Funcionários'], ['agendamentos', `Agendamentos${ags.filter((a) => !a.realizado).length ? ` (${ags.filter((a) => !a.realizado).length})` : ''}`]].map(([v, t]) => (
          <button key={v} onClick={() => setAba(v)} className={`px-4 py-2 rounded-xl text-sm font-bold ${aba === v ? 'bg-amber-600 text-white' : 'bg-[var(--bg-card)] border border-[var(--border-color)]'}`}>{t}</button>
        ))}
      </div>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}

      {aba === 'funcionarios' && (
        <>
          {resumo && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
              {[['Total', resumo.total, '#57534e', '#e7e5e4'], ['🔴 Vermelho', resumo.por_faixa.Vermelho, '#b91c1c', '#fee2e2'],
                ['🟠 Laranja', resumo.por_faixa.Laranja, '#c2410c', '#ffedd5'], ['🟡 Amarelo', resumo.por_faixa.Amarelo, '#a16207', '#fef9c3'],
                ['🟢 Verde', resumo.por_faixa.Verde, '#15803d', '#dcfce7'], ['⚪ Pendente', resumo.por_faixa.Pendente, '#57534e', '#e7e5e4']]
                .map(([t, v, cor, fundo]) => (
                  <button key={t} onClick={() => setFaixa(t === 'Total' ? '' : t.split(' ')[1])}
                    className="rounded-2xl border border-[var(--border-color)] p-4 text-left" style={{ background: fundo }}>
                    <div className="text-2xl font-extrabold" style={{ color: cor }}>{v}</div>
                    <div className="text-xs font-bold" style={{ color: cor }}>{t}</div>
                  </button>
                ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula…"
              className="flex-1 min-w-52 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm" />
            <select value={faixa} onChange={(e) => setFaixa(e.target.value)}
              className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm">
              <option value="">Todas as faixas</option>
              {['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Pendente'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-[var(--bg-card)] text-left text-[var(--text-muted)]">
                  {['Funcionário', 'Matrícula', 'Último exame', 'Vencimento', 'Dias', '%', 'Faixa', 'PDF do exame', 'Presença', 'Ações'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => {
                  const c = corFaixa(a.faixa);
                  return (
                    <tr key={a.id} className="border-t border-[var(--border-color)]">
                      <td className="px-3 py-2 font-medium text-[var(--text-main)]">{a.nome_funcionario}</td>
                      <td className="px-3 py-2">{a.matricula || '—'}</td>
                      <td className="px-3 py-2">{dataBR(a.ultimo_exame)}</td>
                      <td className="px-3 py-2">{dataBR(a.vencimento)}</td>
                      <td className="px-3 py-2">{a.dias_restantes ?? '—'}</td>
                      <td className="px-3 py-2">{pct(a.percentual_restante)}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: c.cor, background: c.fundo }}>{c.icone} {a.faixa}</span>
                        {!!a.faixa_importada && a.faixa_importada !== a.faixa && (
                          <span className="block text-[11px] text-[var(--text-muted)]">planilha: {a.faixa_importada}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {a.pdf_url ? (
                          <span className="inline-flex items-center gap-2">
                            <a href={`${API}${a.pdf_url}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a>
                            <label className="text-blue-600 underline cursor-pointer">alterar<input type="file" accept=".pdf" className="hidden" onChange={(e) => enviarPDF(a.id, e.target.files?.[0])} /></label>
                          </span>
                        ) : (
                          <label className="text-blue-600 underline cursor-pointer inline-flex items-center gap-1"><FileUp size={14} /> anexar<input type="file" accept=".pdf" className="hidden" onChange={(e) => enviarPDF(a.id, e.target.files?.[0])} /></label>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {a.presenca_confirmada
                          ? <span className="text-green-700 font-bold">✅ confirmada{a.presenca_confirmada_em ? ` em ${new Date(a.presenca_confirmada_em).toLocaleDateString('pt-BR')}` : ''}</span>
                          : <span className="text-[var(--text-muted)]">aguardando funcionário</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => abrirExame(a)} className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-bold mr-2" title="Atualizar último exame, vencimento e PDF">Atualizar exame</button>
                        <button onClick={() => abrirAgendar(a.id)} className="text-xs underline">agendar</button>
                      </td>
                    </tr>
                  );
                })}
                {!itens.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-[var(--text-muted)]">Nenhum funcionário. Clique em "Novo funcionário".</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === 'agendamentos' && (
        <div className="space-y-3">
          {ags.map((agItem) => (
            <div key={agItem.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <p className="font-bold text-[var(--text-main)]">{agItem.nome_funcionario}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {new Date(agItem.data_hora).toLocaleString('pt-BR')}{agItem.local_nome ? ` · ${agItem.local_nome}` : ''}
                  {agItem.observacoes ? ` · ${agItem.observacoes}` : ''}
                </p>
                <p className="text-xs mt-1">
                  {agItem.realizado ? <span className="text-green-700 font-bold">✅ exame realizado</span>
                    : agItem.presenca_confirmada ? <span className="text-green-700 font-bold">✅ presença confirmada pelo funcionário</span>
                    : <span className="text-[var(--text-muted)]">aguardando confirmação do funcionário</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {!agItem.realizado && <button onClick={() => { setReagendando(agItem.id); setNovaData(''); }} className="text-xs underline">reagendar</button>}
                {!agItem.presenca_confirmada && !agItem.realizado && (
                  <button onClick={() => confirmarAg(agItem.id)} className="text-xs underline text-green-700" title="Marcar presença confirmada (ex: funcionário confirmou por telefone)">confirmar presença</button>
                )}
                <button onClick={() => concluirAg(agItem)} className="text-xs underline">{agItem.realizado ? 'reabrir' : 'marcar realizado'}</button>
                <button onClick={() => exportarICS(agItem)} className="p-1.5 rounded-lg hover:bg-[var(--bg-main)]" title="Exportar .ics"><Download size={16} /></button>
                <button onClick={() => excluirAg(agItem.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-main)] text-red-600" title="Excluir"><Trash2 size={16} /></button>
              </div>
              {reagendando === agItem.id && (
                <div className="w-full flex gap-2 items-center">
                  <input type="datetime-local" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm" />
                  <button onClick={() => reagendar(agItem.id)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold">Salvar</button>
                  <button onClick={() => setReagendando(null)} className="text-sm underline">cancelar</button>
                </div>
              )}
            </div>
          ))}
          {!ags.length && <p className="text-[var(--text-muted)] text-sm">Nenhum agendamento. Clique em "Agendar exame".</p>}
        </div>
      )}

      {popupNovo && (
        <form onSubmit={salvarNovo} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg text-[var(--text-main)]">Cadastrar funcionário no ASO</h2>
            <label className="block text-sm">Nome do funcionário *
              <input value={novo.nome_funcionario} onChange={(e) => setNovo((v) => ({ ...v, nome_funcionario: e.target.value }))} required className={campo} />
            </label>
            <label className="block text-sm">Matrícula
              <input value={novo.matricula} onChange={(e) => setNovo((v) => ({ ...v, matricula: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">Data de admissão
              <input type="date" value={novo.data_admissao} onChange={(e) => setNovo((v) => ({ ...v, data_admissao: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">Último exame (vazio = nunca realizado)
              <input type="date" value={novo.ultimo_exame} onChange={(e) => setNovo((v) => ({ ...v, ultimo_exame: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">Vencimento do ASO
              <input type="date" value={novo.vencimento} onChange={(e) => setNovo((v) => ({ ...v, vencimento: e.target.value }))} className={campo} />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupNovo(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Cadastrar</button>
            </div>
          </div>
        </form>
      )}

      {!!popupExame && (
        <form onSubmit={salvarExame} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg text-[var(--text-main)]">Atualizar exame — {popupExame.nome_funcionario}</h2>
            <p className="text-xs text-[var(--text-muted)]">Preenchimento automático a partir do agendamento — ajuste se algo mudou. Se o vencimento estiver no passado, o funcionário e o RH são notificados.</p>
            <label className="block text-sm">Último exame
              <input type="date" value={exame.ultimo_exame} onChange={(e) => setExame((v) => ({ ...v, ultimo_exame: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">Vencimento do ASO
              <input type="date" value={exame.vencimento} onChange={(e) => setExame((v) => ({ ...v, vencimento: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">PDF do novo exame (opcional)
              <input type="file" accept=".pdf" onChange={(e) => setPdfExame(e.target.files?.[0] || null)} className={campo} />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupExame(null)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-green-700 text-white font-bold">Salvar exame</button>
            </div>
          </div>
        </form>
      )}

      {popupAg && (
        <form onSubmit={salvarAg} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg text-[var(--text-main)]">Agendar exame</h2>
            <label className="block text-sm">Funcionário
              <select value={ag.aso_id} onChange={(e) => setAg((v) => ({ ...v, aso_id: e.target.value }))} required className={campo}>
                <option value="">Selecione…</option>
                {itens.map((a) => <option key={a.id} value={a.id}>{a.nome_funcionario} — {a.faixa}</option>)}
              </select>
            </label>
            <label className="block text-sm">Data e hora
              <input type="datetime-local" value={ag.data_hora} onChange={(e) => setAg((v) => ({ ...v, data_hora: e.target.value }))} required className={campo} />
            </label>
            <label className="block text-sm">Local do exame
              <select value={ag.local_id} onChange={(e) => setAg((v) => ({ ...v, local_id: e.target.value }))} className={campo}>
                <option value="">Selecione…</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` — ${l.cidade}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm">Observações
              <input value={ag.observacoes} onChange={(e) => setAg((v) => ({ ...v, observacoes: e.target.value }))} className={campo} />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPopupAg(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Agendar</button>
            </div>
          </div>
        </form>
      )}
    </>
  );

  const conteudoFunc = (
    <>
      <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 mb-6"><HeartPulse size={24} /> Meu ASO</h1>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      {!meu && <p className="text-[var(--text-muted)]">Nenhum ASO vinculado a você ainda. Procure o RH.</p>}
      {!!meu && (() => {
        const c = corFaixa(meu.faixa);
        return (
          <div className="max-w-xl space-y-4">
            <div className="rounded-2xl border border-[var(--border-color)] p-6" style={{ background: c.fundo }}>
              <div className="text-4xl font-extrabold" style={{ color: c.cor }}>{c.icone} {meu.faixa}</div>
              <div className="mt-2 text-sm font-medium" style={{ color: c.cor }}>
                {meu.faixa === 'Pendente' ? 'ASO pendente / nunca realizado — procure o RH para agendar.'
                  : `${pct(meu.percentual_restante)} restante · ${meu.dias_restantes} dias a vencer`}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-sm space-y-2">
              <p><strong>Último exame:</strong> {dataBR(meu.ultimo_exame)}</p>
              <p><strong>Vencimento:</strong> {dataBR(meu.vencimento)}</p>
              {!!meu.pdf_url && <p><a href={`${API}${meu.pdf_url}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">Ver PDF do exame</a></p>}
              {!!meu.agendamentos?.length && (
                <div>
                  <strong>Minhas consultas:</strong>
                  <ul className="mt-1 space-y-1">
                    {meu.agendamentos.map((a) => (
                      <li key={a.id} className="text-[var(--text-muted)]">
                        {new Date(a.data_hora).toLocaleString('pt-BR')}{a.local_nome ? ` · ${a.local_nome}` : ''}
                        {a.presenca_confirmada ? ' · ✅ confirmada' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!meu.presenca_confirmada
                ? <button onClick={confirmarMeu} className="mt-2 px-5 py-2.5 rounded-xl bg-green-700 text-white font-bold" title="Avisa o RH que você vai comparecer ao exame">Confirmar minha presença</button>
                : <p className="text-green-700 font-bold">✅ Presença confirmada — o RH já foi avisado</p>}
            </div>
          </div>
        );
      })()}
    </>
  );

  if (perfil === 'leitor') {
    return (
      <div className="min-h-screen bg-[var(--bg-main)]">
        <LeitorTopbar />
        <main className="p-4 sm:p-10 max-w-4xl">{conteudoFunc}</main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-10">{ehRH ? conteudoRH : conteudoFunc}</main>
    </div>
  );
}
