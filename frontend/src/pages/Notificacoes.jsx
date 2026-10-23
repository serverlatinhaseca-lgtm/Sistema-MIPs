import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bell } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

// Histórico + filtros + preferências (ASO vencido e comunicados oficiais são obrigatórios).
const ROTULOS = {
  reclamacao_nova: 'Reclamação', mip_revisao: 'MIP em revisão', mip_aprovacao: 'MIP aprovada',
  mip_correcao: 'MIP correção', avaliacao_nova: '⭐ Avaliação', aso_agendado: '🩺 ASO agendado',
  aso_faixa: '⚠️ ASO a vencer', aso_vencido: '🔴 ASO vencido', aso_confirmado: 'ASO confirmado',
  chat_novo: '💬 Novo ticket', chat_msg: '💬 Mensagem', chat_update: '💬 Ticket atualizado',
  chat_fechado: '💬 Ticket concluído', comunicado_oficial: '📢 Comunicado',
  desabafo: '🤫 Desabafo anônimo',
};

export default function Notificacoes() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [prefs, setPrefs] = useState({});
  const [obrigatorios, setObrigatorios] = useState([]);
  const [msg, setMsg] = useState('');

  async function carregar() {
    const [n, c] = await Promise.all([
      axios.get(`${api}/notificacoes?limite=100`, { headers }),
      axios.get(`${api}/notificacoes/config`, { headers }),
    ]);
    const todas = [...(n.data.itens || [])];
    try {
      const arq = await axios.get(`${api}/notificacoes?somente=arquivadas&limite=100`, { headers });
      todas.push(...(arq.data.itens || []));
    } catch { /* ignora */ }
    todas.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    setItens(todas);
    setPrefs(c.data.prefs || {});
    setObrigatorios(c.data.obrigatorios || []);
  }

  useEffect(() => { carregar().catch(() => {}); }, []);

  async function alternar(tipo, valor) {
    const novas = { ...prefs, [tipo]: valor };
    setPrefs(novas);
    try {
      await axios.put(`${api}/notificacoes/config`, { prefs: novas }, { headers });
      setMsg('Preferências salvas.');
    } catch { setMsg('Erro ao salvar preferências.'); }
  }

  const tipos = [...new Set(itens.map((n) => n.tipo))];
  const visiveis = filtro ? itens.filter((n) => n.tipo === filtro) : itens;

  const conteudo = (
    <>
      <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2 mb-6"><Bell size={24} /> Notificações</h1>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-6 max-w-2xl">
        <h2 className="font-bold text-[var(--text-main)] mb-1">O que quero receber</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">🔴 ASO vencido e 📢 comunicados oficiais são obrigatórios e não podem ser desligados.</p>
        <div className="space-y-2">
          {tipos.filter((t) => !obrigatorios.includes(t)).map((t) => (
            <label key={t} className="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={prefs[t] !== false} onChange={(e) => alternar(t, e.target.checked)} className="w-4 h-4" />
              {ROTULOS[t] || t}
            </label>
          ))}
          {!tipos.filter((t) => !obrigatorios.includes(t)).length && <p className="text-sm text-[var(--text-muted)]">Sem tipos opcionais ainda — eles aparecem conforme você recebe.</p>}
        </div>
      </section>
      <div className="flex gap-2 mb-4">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
          className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{ROTULOS[t] || t}</option>)}
        </select>
      </div>
      <div className="space-y-2 max-w-2xl">
        {visiveis.map((n) => (
          <div key={n.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-main)] truncate">{n.titulo}</p>
              {!!n.mensagem && <p className="text-xs text-[var(--text-muted)] truncate">{n.mensagem}</p>}
              <p className="text-[11px] text-[var(--text-muted)]">{ROTULOS[n.tipo] || n.tipo} · {new Date(n.criado_em).toLocaleString('pt-BR')}{n.lida ? ' · lida' : ''}</p>
            </div>
          </div>
        ))}
        {!visiveis.length && <p className="text-sm text-[var(--text-muted)]">Nada por aqui.</p>}
      </div>
    </>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar /><main className="p-4 sm:p-10 max-w-4xl">{conteudo}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 min-w-0 p-4 sm:p-10">{conteudo}</main></div>;
}
