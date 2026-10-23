import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCheck, Ghost, Search } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import API from '../api';

// Lista de desabafos anônimos: visível para RH e Administrador.
// Nenhum vínculo com usuário é guardado — só a mensagem, o setor (opcional) e a data.
export default function Desabafos() {
  const api = `${API}/api`;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState('nao_lidos');
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    try {
      const { data } = await axios.get(`${api}/desabafos`, { headers });
      setItens(data || []);
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao carregar os desabafos.');
    } finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function marcarLido(id) {
    try {
      const { data } = await axios.patch(`${api}/desabafos/${id}/lido`, {}, { headers });
      setItens((v) => v.map((d) => (d.id === id ? { ...d, ...data } : d)));
    } catch { setMsg('Erro ao marcar como lido.'); }
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = itens
    .filter((d) => {
      if (filtro === 'nao_lidos') return !d.lido_em;
      if (filtro === 'lidos') return !!d.lido_em;
      return true;
    })
    .filter((d) => !termo || String(d.mensagem || '').toLowerCase().includes(termo) || String(d.setor || '').toLowerCase().includes(termo));

  const naoLidos = itens.filter((d) => !d.lido_em).length;
  const abaAtiva = 'px-3 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white';
  const abaInativa = 'px-3 py-2 rounded-xl text-sm font-bold bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)]';

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-10">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2">
          <Ghost size={24} /> Desabafos anônimos
          {naoLidos > 0 && (
            <span className="ml-1 min-w-[22px] h-6 px-2 rounded-full bg-red-600 text-white text-xs font-bold grid place-items-center">{naoLidos}</span>
          )}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1 mb-5">
          Enviados pela página pública, antes do login. Não há registro de quem escreveu.
        </p>

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
              className={`rounded-2xl border p-4 ${d.lido_em ? 'border-[var(--border-color)] bg-[var(--bg-card)]' : 'border-violet-400 bg-[var(--bg-card)] shadow-sm'}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-bold">
                  {d.setor || 'Setor não informado'}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">{new Date(d.criado_em).toLocaleString('pt-BR')}</span>
                {!d.lido_em && <span className="text-[10px] font-bold uppercase text-red-600">novo</span>}
                {d.lido_em
                  ? <span className="ml-auto text-[11px] text-emerald-700 flex items-center gap-1"><CheckCheck size={13} /> lido</span>
                  : (
                    <button onClick={() => marcarLido(d.id)} className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1">
                      <CheckCheck size={13} /> Marcar como lido
                    </button>
                  )}
              </div>
              <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap">{d.mensagem}</p>
            </article>
          ))}
          {!visiveis.length && !carregando && (
            <p className="text-sm text-[var(--text-muted)]">
              {filtro === 'nao_lidos' ? 'Nenhum desabafo novo — tudo em dia.' : 'Nada por aqui com esse filtro.'}
            </p>
          )}
          {carregando && <p className="text-sm text-[var(--text-muted)]">Carregando…</p>}
        </div>
      </main>
    </div>
  );
}
