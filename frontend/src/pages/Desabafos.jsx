import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCheck, Ghost, Search, Eye, X, Paperclip, Download } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import API from '../api';

// Lista de desabafos anônimos: visível para RH e Administrador.
// Nenhum vínculo com usuário é guardado — só a mensagem, o anexo (opcional) e a data.
export default function Desabafos() {
  const api = `${API}/api`;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState('nao_lidos');
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(null);

  async function carregar() {
    try {
      const { data } = await axios.get(`${api}/desabafos`, { headers });
      setItens(data || []);
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao carregar os desabafos.');
    } finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(null); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  async function marcarLido(id) {
    try {
      const { data } = await axios.patch(`${api}/desabafos/${id}/lido`, {}, { headers });
      setItens((v) => v.map((d) => (d.id === id ? { ...d, ...data } : d)));
      setAberto((v) => (v?.id === id ? { ...v, ...data } : v));
    } catch { setMsg('Erro ao marcar como lido.'); }
  }

  const ehImagem = (t) => /^image\//.test(t);
  const ehVideo = (t) => /^video\//.test(t);
  const ehAudio = (t) => /^audio\//.test(t);
  const ehPDF = (t) => /pdf/.test(t);

  const termo = busca.trim().toLowerCase();
  const visiveis = itens
    .filter((d) => {
      if (filtro === 'nao_lidos') return !d.lido_em;
      if (filtro === 'lidos') return !!d.lido_em;
      return true;
    })
    .filter((d) => !termo || String(d.mensagem || '').toLowerCase().includes(termo));

  const naoLidos = itens.filter((d) => !d.lido_em).length;
  const abaAtiva = 'px-3 py-2 rounded-xl text-sm font-bold bg-amber-600 text-white shadow-sm';
  const abaInativa = 'px-3 py-2 rounded-xl text-sm font-bold bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-main)] hover:border-amber-500';

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2">
              <Ghost size={24} /> Desabafos anônimos
              {naoLidos > 0 && (
                <span className="ml-1 min-w-[22px] h-6 px-2 rounded-full bg-red-600 text-white text-xs font-bold grid place-items-center">{naoLidos}</span>
              )}
            </h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              Enviados pela página pública, antes do login. Sem registro de autor.
            </p>
          </div>
        </div>

        {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setFiltro('nao_lidos')} className={filtro === 'nao_lidos' ? abaAtiva : abaInativa}>
            Não lidos {naoLidos > 0 ? `(${naoLidos})` : ''}
          </button>
          <button onClick={() => setFiltro('lidos')} className={filtro === 'lidos' ? abaAtiva : abaInativa}>Lidos</button>
          <button onClick={() => setFiltro('todos')} className={filtro === 'todos' ? abaAtiva : abaInativa}>Todos</button>
          <div className="relative flex-1 min-w-44 sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar na mensagem…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm"
            />
          </div>
        </div>

        <div className="space-y-3 max-w-3xl">
          {visiveis.map((d) => (
            <article
              key={d.id}
              onClick={() => setAberto(d)}
              className={`rounded-2xl border p-4 cursor-pointer transition-shadow ${d.lido_em ? 'border-[var(--border-color)] bg-[var(--bg-card)] hover:shadow-md' : 'border-l-4 border-l-amber-600 border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm'}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] font-bold text-xs">
                  {d.anexo_nome ? '📎 Com anexo' : 'Sem anexo'}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">{new Date(d.criado_em).toLocaleString('pt-BR')}</span>
                {!d.lido_em && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase">novo</span>}
                {d.lido_em
                  ? <span className="ml-auto text-[11px] text-[var(--text-muted)] flex items-center gap-1"><CheckCheck size={13} /> lido</span>
                  : (
                    <button onClick={(e) => { e.stopPropagation(); marcarLido(d.id); }} className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] font-bold flex items-center gap-1 hover:border-emerald-600">
                      <CheckCheck size={13} /> Marcar lido
                    </button>
                  )}
              </div>
              <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap line-clamp-3">{d.mensagem}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-2 flex items-center gap-1">
                <Eye size={12} /> Clique para ver detalhes
              </p>
            </article>
          ))}
          {!visiveis.length && !carregando && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              {filtro === 'nao_lidos' ? 'Nenhum desabafo novo — tudo em dia.' : 'Nada por aqui com esse filtro.'}
            </p>
          )}
          {carregando && <p className="text-sm text-[var(--text-muted)] text-center py-8">Carregando…</p>}
        </div>
      </main>

      {/* Modal de leitura: overlay sobre a lista, sem sair da página. */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAberto(null)}>
          <div
            className="bg-[var(--bg-card)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-[var(--border-color)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--border-color)]">
              <h2 className="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
                <Ghost size={19} /> Desabafo anônimo
              </h2>
              <button onClick={() => setAberto(null)} className="p-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-main)]" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] font-bold">
                  {aberto.anexo_nome ? 'Com anexo' : 'Sem anexo'}
                </span>
                <span className="text-[var(--text-muted)]">{new Date(aberto.criado_em).toLocaleString('pt-BR')}</span>
                {!aberto.lido_em && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-xs">NOVO</span>}
              </div>

              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-main)] bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl p-4">
                {aberto.mensagem || <span className="text-[var(--text-muted)] italic">Sem texto — só anexo.</span>}
              </div>

              {aberto.anexo_url && (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4">
                  <p className="text-sm font-bold text-[var(--text-main)] mb-3 flex items-center gap-2 break-all">
                    <Paperclip size={16} className="shrink-0" /> {aberto.anexo_nome || 'Anexo'}
                  </p>
                  {ehImagem(aberto.anexo_tipo) && (
                    <img src={`${API}${aberto.anexo_url}`} alt={aberto.anexo_nome} className="max-w-full max-h-80 rounded-lg border border-[var(--border-color)] object-contain bg-black/5" />
                  )}
                  {ehVideo(aberto.anexo_tipo) && (
                    <video controls src={`${API}${aberto.anexo_url}`} className="w-full max-h-80 rounded-lg bg-black" />
                  )}
                  {ehAudio(aberto.anexo_tipo) && (
                    <audio controls src={`${API}${aberto.anexo_url}`} className="w-full" />
                  )}
                  {!ehImagem(aberto.anexo_tipo) && !ehVideo(aberto.anexo_tipo) && !ehAudio(aberto.anexo_tipo) && (
                    <a href={`${API}${aberto.anexo_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700">
                      <Download size={15} /> {ehPDF(aberto.anexo_tipo) ? 'Abrir PDF' : 'Abrir arquivo'}
                    </a>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                {aberto.lido_em ? (
                  <span className="text-sm text-[var(--text-main)] flex items-center gap-1.5">
                    <CheckCheck size={16} className="text-emerald-600" /> Marcado como lido
                  </span>
                ) : (
                  <button onClick={() => marcarLido(aberto.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700">
                    <CheckCheck size={16} /> Marcar como lido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
