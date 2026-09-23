import { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, Inbox, Plus, Send, Trash2, Upload } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const statusPt = (s) => ({ vinculado: '✅ vinculado', nao_identificado: '⚠️ não identificado', pdf_ausente: '❌ PDF ausente' }[s] || s);
const compBR = (c) => (c?.length === 7 ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : c);

export default function BancoHoras() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'gerente'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [lotes, setLotes] = useState([]);
  const [loteId, setLoteId] = useState('');
  const [revisao, setRevisao] = useState([]);
  const [novaComp, setNovaComp] = useState(() => new Date().toISOString().slice(0, 7));
  const [meus, setMeus] = useState([]);
  const [filtroComp, setFiltroComp] = useState('');
  const [ind, setInd] = useState({ nome_funcionario: '', matricula: '', cpf: '', competencia: new Date().toISOString().slice(0, 7) });
  const [pdfInd, setPdfInd] = useState(null);
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setMsg('');
    try {
      if (ehRH) {
        const { data } = await axios.get(`${api}/banco-horas/lotes`, { headers });
        setLotes(data || []);
        if (loteId) {
          const r = await axios.get(`${api}/banco-horas/lotes/${loteId}/revisao`, { headers });
          setRevisao(r.data || []);
        }
      } else {
        const q = filtroComp ? `?competencia=${filtroComp}` : '';
        const { data } = await axios.get(`${api}/banco-horas/meus${q}`, { headers });
        setMeus(data || []);
      }
    } catch (e) { setMsg(e.response?.data?.error || 'Erro ao carregar.'); }
  }

  useEffect(() => { carregar().catch(() => {}); }, [loteId, filtroComp]);

  async function criarLote(e) {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${api}/banco-horas/lotes`, { competencia: novaComp }, { headers });
      setLoteId(String(data.id));
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao criar lote.'); }
  }

  async function enviarArquivos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !loteId) return;
    const dados = new FormData();
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) dados.append('pacote', f);
      else if (/\.xlsx?$/i.test(f.name)) dados.append('mapeamento', f);
      else dados.append('pdfs', f);
    }
    setEnviando(true);
    setMsg('Enviando e vinculando…');
    try {
      await axios.post(`${api}/banco-horas/lotes/${loteId}/arquivos`, dados, { headers });
      setMsg('Arquivos na revisão abaixo. Confira antes de publicar.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao enviar arquivos.'); }
    finally { setEnviando(false); }
  }

  async function publicar() {
    if (!confirm('Publicar? Cada PDF será distribuído ao funcionário vinculado e todos serão notificados.')) return;
    try {
      const { data } = await axios.post(`${api}/banco-horas/lotes/${loteId}/publicar`, {}, { headers });
      setMsg(`Publicados: ${data.publicados}. Pendentes (sem vínculo/PDF): ${data.pendentes}.`);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao publicar.'); }
  }

  async function excluirLote(id) {
    if (!confirm('Excluir este rascunho e seus arquivos?')) return;
    await axios.delete(`${api}/banco-horas/lotes/${id}`, { headers });
    if (String(id) === String(loteId)) { setLoteId(''); setRevisao([]); }
    carregar();
  }

  async function enviarIndividual(e) {
    e.preventDefault();
    if (!pdfInd) { setMsg('Anexe o PDF.'); return; }
    const dados = new FormData();
    dados.append('pdf', pdfInd);
    dados.append('nome_funcionario', ind.nome_funcionario);
    dados.append('matricula', ind.matricula);
    dados.append('cpf', ind.cpf);
    dados.append('competencia', ind.competencia);
    try {
      await axios.post(`${api}/banco-horas/individual`, dados, { headers });
      setMsg('Publicado e funcionário notificado.');
      setPdfInd(null);
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao publicar.'); }
  }

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm';
  const lote = lotes.find((l) => String(l.id) === String(loteId));

  const conteudoRH = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><FileText size={24} /> Banco de Horas</h1>
      </div>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <form onSubmit={criarLote} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-3">
          <h2 className="font-bold text-[var(--text-main)]">1. Novo lote em massa</h2>
          <label className="block text-sm">Competência (AAAA-MM)
            <input value={novaComp} onChange={(e) => setNovaComp(e.target.value)} placeholder="2026-09" pattern="\d{4}-\d{2}" className={campo} />
          </label>
          <button className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold">Criar rascunho</button>
          {!!lotes.filter((l) => l.status === 'rascunho').length && (
            <label className="block text-sm">Rascunho em edição
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={campo}>
                <option value="">Selecione…</option>
                {lotes.filter((l) => l.status === 'rascunho').map((l) => <option key={l.id} value={l.id}>#{l.id} · {compBR(l.competencia)} · {l.total} itens</option>)}
              </select>
            </label>
          )}
        </form>
        <form onSubmit={enviarIndividual} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-3">
          <h2 className="font-bold text-[var(--text-main)]">Upload individual (publica direto)</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm col-span-2">Funcionário (nome ou matrícula do login)
              <input value={ind.nome_funcionario} onChange={(e) => setInd((v) => ({ ...v, nome_funcionario: e.target.value }))} required className={campo} />
            </label>
            <label className="block text-sm">Matrícula
              <input value={ind.matricula} onChange={(e) => setInd((v) => ({ ...v, matricula: e.target.value }))} className={campo} />
            </label>
            <label className="block text-sm">Competência
              <input value={ind.competencia} onChange={(e) => setInd((v) => ({ ...v, competencia: e.target.value }))} pattern="\d{4}-\d{2}" className={campo} />
            </label>
          </div>
          <label className="block text-sm">PDF
            <input type="file" accept=".pdf" onChange={(e) => setPdfInd(e.target.files?.[0] || null)} className={campo} />
          </label>
          <button className="px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-bold inline-flex items-center gap-2"><Send size={14} /> Publicar individual</button>
        </form>
      </div>

      {!!loteId && lote && (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-6">
          <h2 className="font-bold text-[var(--text-main)] mb-1">2. Arquivos do lote #{lote.id} · {compBR(lote.competencia)}</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Arraste PDFs, XLSX de mapeamento (Matrícula, Nome, CPF, Arquivo, Competência) ou ZIP (matrícula no nome do arquivo). Nada é publicado antes da revisão.</p>
          <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-8 cursor-pointer text-sm ${enviando ? 'opacity-50' : ''}`}>
            <Upload size={18} /> {enviando ? 'Enviando…' : 'Selecionar arquivos (PDF / XLSX / ZIP)'}
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.zip" className="hidden" disabled={enviando} onChange={enviarArquivos} />
          </label>
          {!!revisao.length && (
            <>
              <h3 className="font-bold text-[var(--text-main)] mt-5 mb-2">3. Revisão antes de publicar</h3>
              <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
                <table className="w-full text-sm min-w-[640px]">
                  <thead><tr className="text-left text-[var(--text-muted)]">{['Arquivo/Funcionário', 'Matrícula', 'CPF', 'Situação'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                  <tbody>
                    {revisao.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--border-color)]">
                        <td className="px-3 py-2">{r.nome_funcionario}{r.pdf_url ? '' : ' (sem PDF)'}</td>
                        <td className="px-3 py-2">{r.matricula || '—'}</td>
                        <td className="px-3 py-2">{r.cpf || '—'}</td>
                        <td className="px-3 py-2">{statusPt(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={publicar} className="mt-4 px-5 py-2.5 rounded-xl bg-green-700 text-white font-bold">Publicar em massa</button>
            </>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
        <h2 className="font-bold text-[var(--text-main)] mb-3 flex items-center gap-2"><Inbox size={18} /> Histórico de lançamentos</h2>
        <div className="space-y-2">
          {lotes.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm border-b border-[var(--border-color)] pb-2">
              <strong>#{l.id} · {compBR(l.competencia)}</strong>
              <span className="text-[var(--text-muted)]">{l.status === 'rascunho' ? 'rascunho' : `publicado em ${new Date(l.publicado_em).toLocaleString('pt-BR')}`} · total {l.total} · ✅ {l.vinculados} · ⚠️/❌ {l.nao_identificados}{l.publicado_por_nome ? ` · por ${l.publicado_por_nome}` : ''}</span>
              <span className="ml-auto flex gap-2">
                {l.status === 'rascunho' && <><button onClick={() => setLoteId(String(l.id))} className="underline text-xs">continuar</button>
                <button onClick={() => excluirLote(l.id)} className="text-red-600" title="Excluir rascunho"><Trash2 size={15} /></button></>}
              </span>
            </div>
          ))}
          {!lotes.length && <p className="text-sm text-[var(--text-muted)]">Nenhum lançamento ainda.</p>}
        </div>
      </section>
    </>
  );

  const conteudoFunc = (
    <>
      <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 mb-5"><FileText size={24} /> Meu Banco de Horas</h1>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <div className="flex gap-2 mb-4 max-w-xs">
        <input value={filtroComp} onChange={(e) => setFiltroComp(e.target.value)} placeholder="Filtrar AAAA-MM" pattern="\d{4}-\d{2}" className="flex-1 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm" />
        {!!filtroComp && <button onClick={() => setFiltroComp('')} className="text-xs underline">limpar</button>}
      </div>
      <div className="space-y-2 max-w-2xl">
        {meus.map((m) => (
          <div key={m.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-bold text-[var(--text-main)]">Competência {compBR(m.competencia)}</p>
              <p className="text-xs text-[var(--text-muted)]">publicado em {new Date(m.publicado_em).toLocaleDateString('pt-BR')}</p>
            </div>
            <a href={`${API}${m.pdf_url}`} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm font-bold">Ver / baixar</a>
          </div>
        ))}
        {!meus.length && <p className="text-sm text-[var(--text-muted)]">Nenhum demonstrativo publicado para você{filtroComp ? ' nesta competência' : ''}.</p>}
      </div>
    </>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar /><main className="p-6 sm:p-10 max-w-4xl">{conteudoFunc}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 p-6 sm:p-10">{ehRH ? conteudoRH : conteudoFunc}</main></div>;
}
