import { useEffect, useState } from 'react';
import axios from 'axios';
import { Megaphone, Plus, RotateCcw, Send } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const corPri = (p) => ({ Normal: '#57534e', Alta: '#a16207', Urgente: '#b91c1c' }[p] || '#57534e');

export default function Comunicados() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'gerente'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ titulo: '', mensagem: '', prioridade: 'Normal', segmento: 'todos', agendado_para: '' });
  const [leituras, setLeituras] = useState(null);
  const [msg, setMsg] = useState('');

  async function carregar() {
    const { data } = await axios.get(`${api}/comunicados`, { headers });
    setItens(data || []);
    // Marca os não lidos como lidos ao abrir (relatório de leitura do RH).
    if (!ehRH) {
      for (const c of (data || []).filter((x) => !x.lido)) {
        axios.post(`${api}/comunicados/${c.id}/ler`, {}, { headers }).catch(() => {});
      }
    }
  }

  useEffect(() => { carregar().catch(() => {}); }, []);

  async function salvar(e) {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${api}/comunicados`, {
        ...form,
        agendado_para: form.agendado_para ? new Date(form.agendado_para).toISOString() : null,
      }, { headers });
      setAberto(false);
      setForm({ titulo: '', mensagem: '', prioridade: 'Normal', segmento: 'todos', agendado_para: '' });
      setMsg(data.enviado_em || !form.agendado_para ? 'Comunicado publicado — todos foram notificados.' : 'Comunicado agendado.');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao publicar.'); }
  }

  async function reenviar(id) {
    if (!confirm('Reenviar este comunicado a todos?')) return;
    const { data } = await axios.post(`${api}/comunicados/${id}/reenviar`, {}, { headers });
    setMsg(`Reenviado para ${data.destinatarios} pessoas.`);
    carregar();
  }

  async function verLeituras(id) {
    const { data } = await axios.get(`${api}/comunicados/${id}/leituras`, { headers });
    setLeituras(data || []);
  }

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm';

  const conteudo = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><Megaphone size={24} /> Comunicados</h1>
        {ehRH && <button onClick={() => setAberto(true)} className="ml-auto px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> Novo comunicado</button>}
      </div>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <div className="space-y-3 max-w-3xl">
        {itens.map((c) => (
          <article key={c.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--bg-main)]" style={{ color: corPri(c.prioridade) }}>{c.prioridade}</span>
              {ehRH && <span className="text-[11px] text-[var(--text-muted)]">para: {c.segmento} · {c.enviado_em ? `enviado em ${new Date(c.enviado_em).toLocaleString('pt-BR')}` : c.agendado_para ? `agendado para ${new Date(c.agendado_para).toLocaleString('pt-BR')}` : 'rascunho'}</span>}
              {!ehRH && <span className="text-[11px] text-[var(--text-muted)]">{new Date(c.enviado_em).toLocaleString('pt-BR')}</span>}
            </div>
            <h2 className="font-bold text-[var(--text-main)]">{c.titulo}</h2>
            <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap mt-1">{c.mensagem}</p>
            {ehRH && (
              <div className="flex flex-wrap gap-3 mt-3 text-xs">
                <span className="text-[var(--text-muted)]">👁️ {c.leituras || 0}/{c.destinatarios || 0} leram</span>
                <button onClick={() => verLeituras(c.id)} className="underline">relatório de leitura</button>
                {!c.enviado_em && !c.agendado_para && <button onClick={() => axios.post(`${api}/comunicados/${c.id}/enviar`, {}, { headers }).then(carregar)} className="underline inline-flex items-center gap-1"><Send size={12} /> enviar agora</button>}
                {!!c.enviado_em && <button onClick={() => reenviar(c.id)} className="underline inline-flex items-center gap-1"><RotateCcw size={12} /> reenviar</button>}
              </div>
            )}
          </article>
        ))}
        {!itens.length && <p className="text-sm text-[var(--text-muted)]">Nenhum comunicado.</p>}
      </div>
      {!!leituras && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setLeituras(null)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-[var(--text-main)] mb-3">Quem leu ({leituras.length})</h2>
            <ul className="max-h-80 overflow-auto space-y-1 text-sm">
              {leituras.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.nome}</span><span className="text-[var(--text-muted)]">{new Date(l.lido_em).toLocaleString('pt-BR')}</span></li>)}
              {!leituras.length && <li className="text-[var(--text-muted)]">Ninguém leu ainda.</li>}
            </ul>
            <button onClick={() => setLeituras(null)} className="mt-4 px-4 py-2 rounded-xl border border-[var(--border-color)]">Fechar</button>
          </div>
        </div>
      )}
      {aberto && (
        <form onSubmit={salvar} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg space-y-3">
            <h2 className="font-bold text-lg text-[var(--text-main)]">Novo comunicado</h2>
            <label className="block text-sm">Título *
              <input value={form.titulo} onChange={(e) => setForm((v) => ({ ...v, titulo: e.target.value }))} required className={campo} />
            </label>
            <label className="block text-sm">Mensagem
              <textarea value={form.mensagem} onChange={(e) => setForm((v) => ({ ...v, mensagem: e.target.value }))} rows={4} className={campo} />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">Prioridade
                <select value={form.prioridade} onChange={(e) => setForm((v) => ({ ...v, prioridade: e.target.value }))} className={campo}>
                  <option>Normal</option><option>Alta</option><option>Urgente</option>
                </select>
              </label>
              <label className="block text-sm">Para quem
                <select value={form.segmento} onChange={(e) => setForm((v) => ({ ...v, segmento: e.target.value }))} className={campo}>
                  <option value="todos">Todos</option><option value="leitor">Funcionários</option>
                  <option value="editor">Líderes</option><option value="gerente">Gerentes</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">Agendar envio (vazio = publicar agora)
              <input type="datetime-local" value={form.agendado_para} onChange={(e) => setForm((v) => ({ ...v, agendado_para: e.target.value }))} className={campo} />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setAberto(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Publicar</button>
            </div>
          </div>
        </form>
      )}
    </>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar /><main className="p-4 sm:p-10 max-w-4xl">{conteudo}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 min-w-0 p-4 sm:p-10">{conteudo}</main></div>;
}
