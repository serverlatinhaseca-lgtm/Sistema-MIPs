import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, FileUp, HeartPulse, Printer, RefreshCw, Upload } from 'lucide-react';
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

export default function ASO() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'gerente'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [resumo, setResumo] = useState(null);
  const [itens, setItens] = useState([]);
  const [faixa, setFaixa] = useState('');
  const [busca, setBusca] = useState('');
  const [meu, setMeu] = useState(null);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState('');

  async function carregar() {
    setMsg('');
    try {
      if (ehRH) {
        const q = new URLSearchParams();
        if (faixa) q.set('faixa', faixa);
        if (busca.trim()) q.set('busca', busca.trim());
        const [r, s] = await Promise.all([
          axios.get(`${api}/asos${q.toString() ? `?${q}` : ''}`, { headers }),
          axios.get(`${api}/asos/resumo`, { headers }),
        ]);
        setItens(r.data || []);
        setResumo(s.data || null);
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

  async function recalcular() {
    if (!confirm('Recalcular dias, percentuais e faixas de todos os ASOs?')) return;
    try {
      const { data } = await axios.post(`${api}/asos/recalcular`, {}, { headers });
      setMsg(`${data.atualizados} recalculados, ${data.mudancas.length} mudanças de faixa.`);
      carregar();
    } catch (e) { setMsg(e.response?.data?.error || 'Erro ao recalcular.'); }
  }

  async function importar(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    setMsg('Importando planilha…');
    try {
      const { data } = await axios.post(`${api}/asos/importar`, dados, { headers });
      setMsg(`Importados: ${data.criados} criados, ${data.atualizados} atualizados.`);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao importar planilha.'); }
  }

  function abrirEdicao(a) {
    setEditando(a.id);
    setForm({
      nome_funcionario: a.nome_funcionario || '', matricula: a.matricula || '',
      data_admissao: String(a.data_admissao || '').slice(0, 10),
      ultimo_exame: String(a.ultimo_exame || '').slice(0, 10),
      vencimento: String(a.vencimento || '').slice(0, 10),
    });
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    try {
      await axios.put(`${api}/asos/${editando}`, {
        ...form,
        data_admissao: form.data_admissao || null,
        ultimo_exame: form.ultimo_exame || null,
        vencimento: form.vencimento || null,
      }, { headers });
      setEditando(null);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao salvar.'); }
  }

  async function anexarPDF(id, arquivo) {
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('pdf', arquivo);
    try {
      await axios.post(`${api}/asos/${id}/pdf`, dados, { headers });
      setMsg('PDF anexado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao anexar PDF.'); }
  }

  async function confirmarPresenca(id, rota = 'asos') {
    try {
      await axios.post(`${api}/${rota}/${id}/confirmar-presenca`, {}, { headers });
      setMsg('Presença confirmada.');
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

  const conteudo = ehRH ? (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><HeartPulse size={24} /> Controle de ASO</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <label className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] cursor-pointer text-sm font-medium flex items-center gap-2">
            <FileUp size={16} /> Importar planilha<input type="file" accept=".xlsx" className="hidden" onChange={importar} />
          </label>
          <button onClick={recalcular} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium flex items-center gap-2"><RefreshCw size={16} /> Recalcular</button>
          <button onClick={exportarCSV} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-medium flex items-center gap-2"><Printer size={16} /> CSV</button>
        </div>
      </div>
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
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
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-[var(--bg-card)] text-left text-[var(--text-muted)]">
              {['Funcionário', 'Matrícula', 'Último exame', 'Vencimento', 'Dias', '%', 'Faixa', 'PDF', 'Ações'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
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
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: c.cor, background: c.fundo }}>
                      {c.icone} {a.faixa}
                    </span>
                    {!!a.faixa_importada && a.faixa_importada !== a.faixa && (
                      <span className="block text-[11px] text-[var(--text-muted)]">planilha: {a.faixa_importada}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.pdf_url
                      ? <a href={`${API}${a.pdf_url}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a>
                      : <label className="text-blue-600 underline cursor-pointer">anexar<input type="file" accept=".pdf" className="hidden" onChange={(e) => anexarPDF(a.id, e.target.files?.[0])} /></label>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => abrirEdicao(a)} className="text-blue-600 underline mr-2">editar</button>
                    {!a.presenca_confirmada && <button onClick={() => confirmarPresenca(a.id)} className="text-green-700 underline">confirmar</button>}
                    {a.presenca_confirmada && <span className="text-green-700 text-xs inline-flex items-center gap-1"><CheckCircle2 size={14} /> presente</span>}
                  </td>
                </tr>
              );
            })}
            {!itens.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--text-muted)]">Nenhum ASO encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {editando && (
        <form onSubmit={salvarEdicao} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-bold text-lg text-[var(--text-main)]">Editar ASO</h2>
            {[['nome_funcionario', 'Nome do funcionário', 'text'], ['matricula', 'Matrícula', 'text'],
              ['data_admissao', 'Data de admissão', 'date'], ['ultimo_exame', 'Último exame', 'date'], ['vencimento', 'Vencimento', 'date']]
              .map(([k, t, tipo]) => (
                <label key={k} className="block text-sm">{t}
                  <input type={tipo} value={form[k] || ''} onChange={(e) => setForm((v) => ({ ...v, [k]: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]" />
                </label>
              ))}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Salvar</button>
            </div>
          </div>
        </form>
      )}
    </>
  ) : (
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
              {!!meu.pdf_url && <p><a href={`${API}${meu.pdf_url}`} target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-1"><Upload size={14} /> Ver PDF do exame</a></p>}
              {!!meu.agendamentos?.length && (
                <div>
                  <strong>Próximas consultas / histórico:</strong>
                  <ul className="mt-1 space-y-1">
                    {meu.agendamentos.map((ag) => (
                      <li key={ag.id} className="text-[var(--text-muted)]">
                        {new Date(ag.data_hora).toLocaleString('pt-BR')}{ag.local_nome ? ` · ${ag.local_nome}` : ''}
                        {ag.presenca_confirmada ? ' · ✅ confirmada' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!meu.presenca_confirmada
                ? <button onClick={() => confirmarPresenca(meu.id)} className="mt-2 px-5 py-2.5 rounded-xl bg-green-700 text-white font-bold">Confirmar presença</button>
                : <p className="text-green-700 font-bold inline-flex items-center gap-1"><CheckCircle2 size={16} /> Presença confirmada</p>}
            </div>
          </div>
        );
      })()}
      {!!meu && meu.faixa === 'Vermelho' && (
        <p className="mt-4 text-sm font-bold text-red-700 inline-flex items-center gap-2"><AlertTriangle size={16} /> Seu ASO está em faixa crítica. Procure o RH com urgência.</p>
      )}
    </>
  );

  if (perfil === 'leitor') {
    return (
      <div className="min-h-screen bg-[var(--bg-main)]">
        <LeitorTopbar />
        <main className="p-6 sm:p-10 max-w-4xl">{conteudo}</main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-10">{conteudo}</main>
    </div>
  );
}
